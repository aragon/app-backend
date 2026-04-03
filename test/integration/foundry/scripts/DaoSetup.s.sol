// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Base.s.sol";

interface IDAOFactory {
    function createDao(DAOSettings calldata, PluginSettings[] calldata) external returns (address);
}

contract DaoSetup is Base {
    function run() public {
        address deployer = _setup();

        PluginSettings[] memory plugins = new PluginSettings[](1);
        plugins[0] = DaoLib.adminPluginSettings(deployer);

        IDAOFactory(DAO_FACTORY).createDao(DaoLib.defaultDaoSettings(), plugins);

        _teardown();
    }
}
