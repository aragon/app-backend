// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Base.s.sol";

interface IDAOFactory {
    function createDao(DAOSettings calldata, PluginSettings[] calldata) external returns (address);
}

contract MultisigSetup is Base {
    struct MultisigSettings {
        bool onlyListed;
        uint16 minApprovals;
    }

    function run() public {
        address deployer = _setup();

        address[] memory members = new address[](1);
        members[0] = deployer;

        PluginSettings[] memory plugins = new PluginSettings[](2);
        plugins[0] = DaoLib.adminPluginSettings(deployer);
        plugins[1] = PluginSettings({
            pluginSetupRef: PluginSetupRef({
                versionTag: PluginRepo_Tag({ release: MULTISIG_PLUGIN_RELEASE, build: MULTISIG_PLUGIN_BUILD }),
                pluginSetupRepo: MULTISIG_PLUGIN_REPO
            }),
            data: abi.encode(members, MultisigSettings({ onlyListed: true, minApprovals: 1 }))
        });

        IDAOFactory(DAO_FACTORY).createDao(DaoLib.defaultDaoSettings(), plugins);

        _teardown();
    }
}
