// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PayRailEndpointRegistry {
    error ZeroWallet();

    mapping(bytes32 => address) private endpointWallets;

    event EndpointRegistered(bytes32 indexed endpointId, address indexed wallet, address indexed registrar);

    function registerEndpoint(address wallet, bytes32 endpointId) external {
        if (wallet == address(0)) {
            revert ZeroWallet();
        }

        endpointWallets[endpointId] = wallet;
        emit EndpointRegistered(endpointId, wallet, msg.sender);
    }

    function getWallet(bytes32 endpointId) external view returns (address) {
        return endpointWallets[endpointId];
    }
}
