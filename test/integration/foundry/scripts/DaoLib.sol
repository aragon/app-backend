// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

struct DAOSettings {
    address trustedForwarder;
    string daoURI;
    string subdomain;
    bytes metadata;
}

struct PluginRepo_Tag {
    uint8 release;
    uint16 build;
}

struct PluginSetupRef {
    PluginRepo_Tag versionTag;
    address pluginSetupRepo;
}

struct PluginSettings {
    PluginSetupRef pluginSetupRef;
    bytes data;
}

library DaoLib {
    // Admin plugin repo (release 1, build 2)
    address constant ADMIN_PLUGIN_REPO    = 0xA4371a239D08bfBA6E8894eccf8466C6323A52C3;
    uint8   constant ADMIN_PLUGIN_RELEASE = 1;
    uint16  constant ADMIN_PLUGIN_BUILD   = 2;

    function defaultDaoSettings() internal pure returns (DAOSettings memory) {
        return DAOSettings({ trustedForwarder: address(0), daoURI: '', subdomain: '', metadata: bytes('') });
    }

    function adminPluginSettings(address admin) internal pure returns (PluginSettings memory) {
        return PluginSettings({
            pluginSetupRef: PluginSetupRef({
                versionTag: PluginRepo_Tag({ release: ADMIN_PLUGIN_RELEASE, build: ADMIN_PLUGIN_BUILD }),
                pluginSetupRepo: ADMIN_PLUGIN_REPO
            }),
            data: abi.encode(admin, address(0), uint8(0))
        });
    }
}
