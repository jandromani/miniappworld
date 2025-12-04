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

contract TournamentManagerTest is Test {
    TournamentManager internal manager;
    MockERC20 internal token;
    bytes32 internal tournamentId;

    address internal alice = address(0x1);
    address internal bob = address(0x2);
    address internal carol = address(0x3);

    uint256 internal constant BUY_IN = 1 ether;

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
}
