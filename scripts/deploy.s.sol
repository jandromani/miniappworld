// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TournamentManager} from "../contracts/TournamentManager.sol";

interface Vm {
    function envAddress(string calldata key) external returns (address value);
    function broadcast() external;
    function stopBroadcast() external;
}

contract DeployTournamentManager {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run() external returns (TournamentManager manager) {
        address owner = vm.envAddress("OWNER");
        vm.broadcast();
        manager = new TournamentManager(owner);
        vm.stopBroadcast();
    }
}
