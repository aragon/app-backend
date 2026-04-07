// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "./DaoLib.sol";

contract Base is Script {
    // Ethereum mainnet Aragon OSx addresses
    address constant DAO_FACTORY            = 0x246503df057A9a85E0144b6867a828c99676128B;
    address constant PLUGIN_SETUP_PROCESSOR = 0xE978942c691e43f65c1B7c7F8f1dc8cDF061B13f;

    // Multisig plugin repo (release 1, build 2)
    address constant MULTISIG_PLUGIN_REPO    = 0x8c278e37D0817210E18A7958524b7D0a1fAA6F7b;
    uint8   constant MULTISIG_PLUGIN_RELEASE = 1;
    uint16  constant MULTISIG_PLUGIN_BUILD   = 2;

    function _setup() internal returns (address deployer) {
        // Derive the deployer from the broadcasting private key — NOT from msg.sender,
        // which at this point is the foundry default script sender, not the --private-key account.
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        deployer = vm.addr(pk);
        vm.deal(deployer, 100 ether);
        vm.startBroadcast(pk);
    }

    function _teardown() internal {
        vm.stopBroadcast();
    }
}
