// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TournamentManager} from "../contracts/TournamentManager.sol";
import {MockERC20} from "../contracts/mocks/MockERC20.sol";

interface Vm {
    function warp(uint256) external;
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function expectRevert(bytes calldata) external;
    function expectRevert() external;
    function expectEmit(bool, bool, bool, bool) external;
    function expectEmit(bool, bool, bool, bool, address) external;
}

contract Test {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertEq(uint256 a, uint256 b, string memory message) internal pure {
        require(a == b, message);
    }

    function assertEq(address a, address b, string memory message) internal pure {
        require(a == b, message);
    }

    function assertTrue(bool value, string memory message) internal pure {
        require(value, message);
    }
}

contract SixDecimalToken is MockERC20 {
    constructor() MockERC20("PUF Token", "PUF") {
        decimals = 6;
    }
}

contract TournamentManagerTest is Test {
    TournamentManager internal manager;
    MockERC20 internal token;
    bytes32 internal tournamentId;

    address internal alice = address(0x1);
    address internal bob = address(0x2);
    address internal carol = address(0x3);

    uint256 internal constant BUY_IN = 1 ether;

    event PlayerJoined(bytes32 indexed tournamentId, address indexed player, uint256 buyInAmount);
    event PrizesDistributed(bytes32 indexed tournamentId, address[] winners, uint256[] prizes);

    function setUp() public {
        manager = new TournamentManager(address(this));
        token = new MockERC20("Mock Token", "MOCK");
        tournamentId = keccak256("tournament-1");

        uint16[] memory distribution = new uint16[](3);
        distribution[0] = 6000;
        distribution[1] = 2500;
        distribution[2] = 1500;

        uint256 start = block.timestamp + 10;
        uint256 end = start + 1 hours;

        manager.createTournament(tournamentId, start, end, address(token), BUY_IN, 4, distribution);

        token.mint(alice, 10 ether);
        token.mint(bob, 10 ether);
        token.mint(carol, 10 ether);
    }

    function testCreateTournamentStoresConfig() public {
        (
            address tokenAddr,
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
        ) = manager.getTournament(tournamentId);

        assertEq(tokenAddr, address(token), "token mismatch");
        assertEq(buyInAmount, BUY_IN, "buy-in mismatch");
        assertEq(startTime, block.timestamp + 10, "startTime mismatch");
        assertEq(endTime, startTime + 1 hours, "endTime mismatch");
        assertEq(maxPlayers, 4, "max players mismatch");
        assertEq(prizePool, 0, "prize pool should be zero initially");
        assertTrue(!finalized && !prizesDistributed, "flags should be false");
        assertEq(prizeDistribution.length, 3, "distribution length");
        assertEq(players.length, 0, "no players expected");
        assertEq(winners.length, 0, "no winners expected");
    }

    function testJoinCollectsBuyInAndTracksPlayer() public {
        vm.startPrank(alice);
        token.approve(address(manager), BUY_IN);
        manager.joinTournament(tournamentId);
        vm.stopPrank();

        assertEq(token.balanceOf(address(manager)), BUY_IN, "pool balance incorrect");
        assertTrue(manager.isPlayerRegistered(tournamentId, alice), "player should be registered");
    }

    function testJoinRespectsMaxPlayers() public {
        vm.startPrank(alice);
        token.approve(address(manager), BUY_IN);
        manager.joinTournament(tournamentId);
        vm.stopPrank();

        vm.startPrank(bob);
        token.approve(address(manager), BUY_IN);
        manager.joinTournament(tournamentId);
        vm.stopPrank();

        vm.startPrank(carol);
        token.approve(address(manager), BUY_IN);
        manager.joinTournament(tournamentId);
        vm.stopPrank();

        address dave = address(0x4);
        token.mint(dave, 10 ether);
        vm.startPrank(dave);
        token.approve(address(manager), BUY_IN);
        manager.joinTournament(tournamentId);
        vm.stopPrank();

        address erin = address(0x5);
        token.mint(erin, 10 ether);
        vm.startPrank(erin);
        token.approve(address(manager), BUY_IN);
        vm.expectRevert("Tournament full");
        manager.joinTournament(tournamentId);
        vm.stopPrank();
    }

    function _joinAll() internal {
        vm.startPrank(alice);
        token.approve(address(manager), BUY_IN);
        manager.joinTournament(tournamentId);
        vm.stopPrank();

        vm.startPrank(bob);
        token.approve(address(manager), BUY_IN);
        manager.joinTournament(tournamentId);
        vm.stopPrank();

        vm.startPrank(carol);
        token.approve(address(manager), BUY_IN);
        manager.joinTournament(tournamentId);
        vm.stopPrank();
    }

    function testSubmitScoreRequiresAuthorization() public {
        _joinAll();
        vm.warp(block.timestamp + 2 hours);

        vm.prank(alice);
        vm.expectRevert("Unauthorized submitter");
        manager.submitScore(tournamentId, alice, 100);

        manager.submitScore(tournamentId, alice, 100);
        assertEq(manager.scoreOf(tournamentId, alice), 100, "score should be saved");
    }

    function testFinalizeAndDistributePrizes() public {
        _joinAll();
        vm.warp(block.timestamp + 2 hours);

        manager.submitScore(tournamentId, alice, 50);
        manager.submitScore(tournamentId, bob, 200);
        manager.submitScore(tournamentId, carol, 100);

        manager.finalizeTournament(tournamentId);
        address[] memory winners = manager.getWinners(tournamentId);
        assertEq(winners.length, 3, "winner length");
        assertEq(winners[0], bob, "bob should be first");
        assertEq(winners[1], carol, "carol should be second");
        assertEq(winners[2], alice, "alice should be third");

        uint256 initialPool = token.balanceOf(address(manager));
        manager.distributePrizes(tournamentId);

        uint256 expectedFirst = (initialPool * 6000) / manager.PRIZE_DISTRIBUTION_SCALE();
        uint256 expectedSecond = (initialPool * 2500) / manager.PRIZE_DISTRIBUTION_SCALE();
        uint256 expectedThird = (initialPool * 1500) / manager.PRIZE_DISTRIBUTION_SCALE();

        assertEq(token.balanceOf(bob), 10 ether - BUY_IN + expectedFirst, "bob prize");
        assertEq(token.balanceOf(carol), 10 ether - BUY_IN + expectedSecond, "carol prize");
        assertEq(token.balanceOf(alice), 10 ether - BUY_IN + expectedThird, "alice prize");
    }

    function testPufTokenFlowEmitsEventsAndPaysWithDecimals() public {
        TournamentManager pufManager = new TournamentManager(address(this));
        SixDecimalToken puf = new SixDecimalToken();
        bytes32 pufTournamentId = keccak256("puf-cup");

        uint16[] memory distribution = new uint16[](2);
        distribution[0] = 7000;
        distribution[1] = 3000;

        uint256 start = block.timestamp + 5;
        uint256 end = start + 30 minutes;
        uint256 buyIn = 5 * 10 ** puf.decimals();

        pufManager.createTournament(pufTournamentId, start, end, address(puf), buyIn, 2, distribution);

        uint256 initialBalance = 1000 * 10 ** puf.decimals();
        puf.mint(alice, initialBalance);
        puf.mint(bob, initialBalance);

        vm.startPrank(alice);
        puf.approve(address(pufManager), buyIn);
        vm.expectEmit(true, true, true, true, address(pufManager));
        emit PlayerJoined(pufTournamentId, alice, buyIn);
        pufManager.joinTournament(pufTournamentId);
        vm.stopPrank();

        vm.startPrank(bob);
        puf.approve(address(pufManager), buyIn);
        vm.expectEmit(true, true, true, true, address(pufManager));
        emit PlayerJoined(pufTournamentId, bob, buyIn);
        pufManager.joinTournament(pufTournamentId);
        vm.stopPrank();

        vm.warp(block.timestamp + 1 hours);
        pufManager.submitScore(pufTournamentId, alice, 10);
        pufManager.submitScore(pufTournamentId, bob, 100);

        pufManager.finalizeTournament(pufTournamentId);

        uint256 poolBefore = puf.balanceOf(address(pufManager));

        address[] memory expectedWinners = new address[](2);
        expectedWinners[0] = bob;
        expectedWinners[1] = alice;

        uint256[] memory expectedPrizes = new uint256[](2);
        expectedPrizes[0] = (poolBefore * distribution[0]) / pufManager.PRIZE_DISTRIBUTION_SCALE();
        expectedPrizes[1] = (poolBefore * distribution[1]) / pufManager.PRIZE_DISTRIBUTION_SCALE();

        vm.expectEmit(true, true, true, true, address(pufManager));
        emit PrizesDistributed(pufTournamentId, expectedWinners, expectedPrizes);
        pufManager.distributePrizes(pufTournamentId);

        assertEq(
            puf.balanceOf(bob),
            initialBalance - buyIn + expectedPrizes[0],
            "bob should receive first prize"
        );
        assertEq(
            puf.balanceOf(alice),
            initialBalance - buyIn + expectedPrizes[1],
            "alice should receive second prize"
        );
        assertEq(puf.balanceOf(address(pufManager)), 0, "pool should be emptied");
    }
}
