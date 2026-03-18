"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.credentials = exports.nodes = void 0;
const Plentymarkets_node_1 = require("./nodes/Plentymarkets/Plentymarkets.node");
const PlentymarketsApi_credentials_1 = require("./credentials/PlentymarketsApi.credentials");
exports.nodes = [
    {
        type: 'n8n-nodes-plentymarkets.Plentymarkets',
        class: Plentymarkets_node_1.Plentymarkets,
    },
];
exports.credentials = [
    {
        name: 'plentymarketsApi',
        class: PlentymarketsApi_credentials_1.PlentymarketsApi,
    },
];
//# sourceMappingURL=index.js.map