// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TournamentPool {
    address public owner;
    uint256 public buyIn;

    mapping(address => uint256) public entries;
    address[] public players;

    event Entered(address indexed player, uint256 amount);
    event PrizesDistributed(address indexed caller, uint256 winners);

    constructor(uint256 _buyIn) {
        owner = msg.sender;
        buyIn = _buyIn;
    }

    function enterTournament() external payable {
        require(msg.value >= buyIn, "Buy-in insuficiente");
        if (entries[msg.sender] == 0) {
            players.push(msg.sender);
        }
        entries[msg.sender] += msg.value;
        emit Entered(msg.sender, msg.value);
    }

    function distributePrizes(address[] calldata winners) external {
        require(msg.sender == owner, "Solo owner");
        require(address(this).balance > 0, "Sin fondos");
        require(winners.length > 0, "Sin ganadores");

        uint256 share = address(this).balance / winners.length;
        for (uint256 i = 0; i < winners.length; i++) {
            payable(winners[i]).transfer(share);
        }
        emit PrizesDistributed(msg.sender, winners.length);
    }

    function poolBalance() external view returns (uint256) {
        return address(this).balance;
    }
}
