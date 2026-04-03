// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";

contract Base is Script {
    // Ethereum mainnet Aragon OSx addresses
    address constant DAO_FACTORY = 0x246503df057A9a85E0144b6867a828c99676128B;
    address constant PLUGIN_SETUP_PROCESSOR = 0xE978942c691e43f65c1B7c7F8f1dc8cDF061B13f;

    // Admin plugin repo (release 1, build 2)
    address constant ADMIN_PLUGIN_REPO = 0xA4371a239D08bfBA6E8894eccf8466C6323A52C3;
    uint8  constant ADMIN_PLUGIN_RELEASE = 1;
    uint16 constant ADMIN_PLUGIN_BUILD   = 2;
}
