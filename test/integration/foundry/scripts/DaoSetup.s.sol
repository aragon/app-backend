// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Base.s.sol";

interface IDAOFactory {
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

    function createDao(
        DAOSettings calldata _daoSettings,
        PluginSettings[] calldata _pluginSettings
    ) external returns (address createdDao);
}

contract DaoSetup is Base {
    address public deployer;

    function run() public {
        deployer = msg.sender;
        vm.deal(deployer, 100 ether);
        vm.startBroadcast();

        // Encode admin plugin setup data: (address admin, (address target, uint8 operation))
        // Static tuple is encoded inline — same as (address, address, uint8)
        bytes memory adminPluginData = abi.encode(
            deployer,
            address(0), // targetConfig.target = 0x0 (uses DAO)
            uint8(0)    // targetConfig.operation = Call
        );

        IDAOFactory.PluginSettings[] memory plugins = new IDAOFactory.PluginSettings[](1);
        plugins[0] = IDAOFactory.PluginSettings({
            pluginSetupRef: IDAOFactory.PluginSetupRef({
                versionTag: IDAOFactory.PluginRepo_Tag({
                    release: ADMIN_PLUGIN_RELEASE,
                    build: ADMIN_PLUGIN_BUILD
                }),
                pluginSetupRepo: ADMIN_PLUGIN_REPO
            }),
            data: adminPluginData
        });

        IDAOFactory.DAOSettings memory daoSettings = IDAOFactory.DAOSettings({
            trustedForwarder: address(0),
            daoURI: '',
            subdomain: '',
            metadata: bytes('')
        });

        IDAOFactory(DAO_FACTORY).createDao(daoSettings, plugins);

        vm.stopBroadcast();
    }
}
