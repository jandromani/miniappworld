// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "./lib/openzeppelin/access/Ownable.sol";
import {ReentrancyGuard} from "./lib/openzeppelin/security/ReentrancyGuard.sol";
import {SafeERC20} from "./lib/openzeppelin/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "./lib/openzeppelin/token/ERC20/IERC20.sol";
import {ECDSA} from "./lib/openzeppelin/utils/cryptography/ECDSA.sol";

contract TournamentManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant PRIZE_DISTRIBUTION_SCALE = 10000;

    struct Tournament {
        bytes32 tournamentId;
        uint256 startTime;
        uint256 endTime;
        IERC20 buyInToken;
        uint256 buyInAmount;
        uint256 maxPlayers;
        uint16[] prizeDistribution;
        bool finalized;
        bool prizesDistributed;
        uint256 prizePool;
        address[] players;
        address[] winners;
        mapping(address => bool) registered;
        mapping(address => uint256) scores;
    }

    mapping(bytes32 => Tournament) private tournaments;
    mapping(bytes32 => bool) private tournamentExists;
    mapping(address => bool) public authorizedSubmitters;

    event TournamentCreated(bytes32 indexed tournamentId, address token, uint256 buyInAmount, uint256 startTime, uint256 endTime);
    event PlayerJoined(bytes32 indexed tournamentId, address indexed player, uint256 buyInAmount);
    event ScoreSubmitted(bytes32 indexed tournamentId, address indexed player, uint256 score);
    event TournamentFinalized(bytes32 indexed tournamentId, address[] winners);
    event PrizesDistributed(bytes32 indexed tournamentId, address[] winners, uint256[] prizes);
    event SubmitterAuthorizationUpdated(address indexed submitter, bool authorized);

    constructor(address initialOwner) Ownable(initialOwner) {
        authorizedSubmitters[initialOwner] = true;
    }

    modifier onlyExistingTournament(bytes32 tournamentId) {
        require(tournamentExists[tournamentId], "Tournament does not exist");
        _;
    }

    modifier onlyAuthorizedSubmitter() {
        require(authorizedSubmitters[msg.sender] || msg.sender == owner(), "Unauthorized submitter");
        _;
    }

    function setAuthorizedSubmitter(address submitter, bool authorized) external onlyOwner {
        authorizedSubmitters[submitter] = authorized;
        emit SubmitterAuthorizationUpdated(submitter, authorized);
    }

    function createTournament(
        bytes32 tournamentId,
        uint256 startTime,
        uint256 endTime,
        address buyInToken,
        uint256 buyInAmount,
        uint256 maxPlayers,
        uint16[] memory prizeDistribution
    ) external onlyOwner {
        require(!tournamentExists[tournamentId], "Tournament already exists");
        require(buyInToken != address(0), "Invalid token");
        require(buyInAmount > 0, "Invalid buy-in amount");
        require(maxPlayers > 0, "Invalid max players");
        require(startTime < endTime, "Invalid schedule");
        require(prizeDistribution.length > 0, "Invalid prize distribution");

        uint256 distributionTotal;
        for (uint256 i = 0; i < prizeDistribution.length; i++) {
            distributionTotal += prizeDistribution[i];
        }
        require(distributionTotal == PRIZE_DISTRIBUTION_SCALE, "Prize distribution must equal scale");

        Tournament storage tournament = tournaments[tournamentId];
        tournament.tournamentId = tournamentId;
        tournament.startTime = startTime;
        tournament.endTime = endTime;
        tournament.buyInToken = IERC20(buyInToken);
        tournament.buyInAmount = buyInAmount;
        tournament.maxPlayers = maxPlayers;
        tournament.prizeDistribution = prizeDistribution;

        tournamentExists[tournamentId] = true;

        emit TournamentCreated(tournamentId, buyInToken, buyInAmount, startTime, endTime);
    }

    function joinTournament(bytes32 tournamentId) external nonReentrant onlyExistingTournament(tournamentId) {
        Tournament storage tournament = tournaments[tournamentId];
        require(block.timestamp < tournament.startTime, "Tournament already started");
        require(!tournament.finalized, "Tournament finalized");
        require(!tournament.prizesDistributed, "Prizes already distributed");
        require(!tournament.registered[msg.sender], "Player already joined");
        require(tournament.players.length < tournament.maxPlayers, "Tournament full");

        tournament.buyInToken.safeTransferFrom(msg.sender, address(this), tournament.buyInAmount);
        tournament.prizePool += tournament.buyInAmount;
        tournament.registered[msg.sender] = true;
        tournament.players.push(msg.sender);

        emit PlayerJoined(tournamentId, msg.sender, tournament.buyInAmount);
    }

    function submitScore(bytes32 tournamentId, address player, uint256 score)
        external
        onlyExistingTournament(tournamentId)
        onlyAuthorizedSubmitter
    {
        _recordScore(tournamentId, player, score);
    }

    function submitScoreWithSignature(
        bytes32 tournamentId,
        address player,
        uint256 score,
        bytes memory signature
    ) external onlyExistingTournament(tournamentId) {
        bytes32 messageHash = keccak256(abi.encodePacked(address(this), tournamentId, player, score));
        bytes32 ethSignedMessageHash = ECDSA.toEthSignedMessageHash(messageHash);
        address signer = ECDSA.recover(ethSignedMessageHash, signature);
        require(signer == player, "Invalid signature");

        _recordScore(tournamentId, player, score);
    }

    function finalizeTournament(bytes32 tournamentId) external onlyOwner onlyExistingTournament(tournamentId) {
        Tournament storage tournament = tournaments[tournamentId];
        require(block.timestamp > tournament.endTime, "Tournament not finished");
        require(!tournament.finalized, "Tournament already finalized");
        require(tournament.players.length > 0, "No players registered");

        address[] memory rankedPlayers = _rankPlayers(tournamentId);
        uint256 winnerCount = tournament.prizeDistribution.length;
        if (winnerCount > rankedPlayers.length) {
            winnerCount = rankedPlayers.length;
        }

        delete tournament.winners;
        for (uint256 i = 0; i < winnerCount; i++) {
            tournament.winners.push(rankedPlayers[i]);
        }

        tournament.finalized = true;
        emit TournamentFinalized(tournamentId, tournament.winners);
    }

    function distributePrizes(bytes32 tournamentId) external onlyOwner nonReentrant onlyExistingTournament(tournamentId) {
        Tournament storage tournament = tournaments[tournamentId];
        require(tournament.finalized, "Tournament not finalized");
        require(!tournament.prizesDistributed, "Prizes already distributed");
        require(tournament.winners.length > 0, "No winners recorded");

        uint256[] memory prizes = new uint256[](tournament.winners.length);
        uint256 pool = tournament.prizePool;
        IERC20 prizeToken = tournament.buyInToken;

        for (uint256 i = 0; i < tournament.winners.length; i++) {
            uint256 share = tournament.prizeDistribution[i];
            prizes[i] = (pool * share) / PRIZE_DISTRIBUTION_SCALE;
            prizeToken.safeTransfer(tournament.winners[i], prizes[i]);
        }

        tournament.prizesDistributed = true;
        emit PrizesDistributed(tournamentId, tournament.winners, prizes);
    }

    function getTournament(bytes32 tournamentId)
        external
        view
        onlyExistingTournament(tournamentId)
        returns (
            address token,
            uint256 buyInAmount,
            uint256 startTime,
            uint256 endTime,
            uint256 maxPlayers,
            uint256 prizePool,
            bool finalized,
            bool prizesDistributed,
            uint16[] memory prizeDistribution,
            address[] memory players,
            address[] memory winners
        )
    {
        Tournament storage tournament = tournaments[tournamentId];
        token = address(tournament.buyInToken);
        buyInAmount = tournament.buyInAmount;
        startTime = tournament.startTime;
        endTime = tournament.endTime;
        maxPlayers = tournament.maxPlayers;
        prizePool = tournament.prizePool;
        finalized = tournament.finalized;
        prizesDistributed = tournament.prizesDistributed;
        prizeDistribution = tournament.prizeDistribution;
        players = tournament.players;
        winners = tournament.winners;
    }

    function getPlayers(bytes32 tournamentId) external view onlyExistingTournament(tournamentId) returns (address[] memory) {
        return tournaments[tournamentId].players;
    }

    function getWinners(bytes32 tournamentId) external view onlyExistingTournament(tournamentId) returns (address[] memory) {
        return tournaments[tournamentId].winners;
    }

    function scoreOf(bytes32 tournamentId, address player) external view onlyExistingTournament(tournamentId) returns (uint256) {
        return tournaments[tournamentId].scores[player];
    }

    function isPlayerRegistered(bytes32 tournamentId, address player)
        external
        view
        onlyExistingTournament(tournamentId)
        returns (bool)
    {
        return tournaments[tournamentId].registered[player];
    }

    function _recordScore(bytes32 tournamentId, address player, uint256 score) internal {
        Tournament storage tournament = tournaments[tournamentId];
        require(block.timestamp > tournament.endTime, "Tournament not finished");
        require(!tournament.finalized, "Tournament finalized");
        require(tournament.registered[player], "Player not registered");

        tournament.scores[player] = score;
        emit ScoreSubmitted(tournamentId, player, score);
    }

    function _rankPlayers(bytes32 tournamentId) internal view returns (address[] memory) {
        Tournament storage tournament = tournaments[tournamentId];
        address[] memory ranked = tournament.players;
        uint256 length = ranked.length;

        for (uint256 i = 0; i < length; i++) {
            for (uint256 j = i + 1; j < length; j++) {
                if (tournament.scores[ranked[j]] > tournament.scores[ranked[i]]) {
                    address temp = ranked[i];
                    ranked[i] = ranked[j];
                    ranked[j] = temp;
                }
            }
        }
        return ranked;
    }
}
