"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Plentymarkets = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const operationsDir = path.join(__dirname, 'operations');
const resourceFiles = fs.readdirSync(operationsDir).filter(f => f.endsWith('.json'));
const seenResources = new Set();
const resourceDefinitions = [];
for (const file of resourceFiles) {
    const content = fs.readFileSync(path.join(operationsDir, file), 'utf-8');
    const definition = JSON.parse(content);
    if (!seenResources.has(definition.resource)) {
        resourceDefinitions.push(definition);
        seenResources.add(definition.resource);
    }
}
const resourceOptions = resourceDefinitions.map((r) => ({
    name: r.displayName,
    value: r.resource,
}));
const allProperties = [
    {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        options: resourceOptions,
        default: 'custom',
    },
    {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        options: [],
        default: '',
        displayOptions: {
            show: {
                resource: resourceDefinitions.map(r => r.resource),
            },
        },
    },
];
const operationOptions = new Set();
resourceDefinitions.forEach((def) => {
    def.operations.forEach((op) => {
        const value = `${def.resource}.${op.value}`;
        if (!operationOptions.has(value)) {
            allProperties.find((p) => p.name === 'operation').options.push({
                name: op.name,
                value,
                description: op.description ?? '',
            });
            operationOptions.add(value);
        }
        if (op.parameters) {
            op.parameters.forEach((param) => {
                allProperties.push({
                    ...param,
                    displayOptions: {
                        show: {
                            resource: [def.resource],
                            operation: [`${def.resource}.${op.value}`],
                        },
                    },
                });
            });
        }
    });
});
class Plentymarkets {
    constructor() {
        this.description = {
            displayName: 'PlentyONE',
            name: 'Plentymarkets',
            group: ['transform'],
            version: 1,
            description: 'Work with the PlentyONE (formerly plentymarkets) REST API',
            defaults: {
                name: 'PlentyONE',
            },
            inputs: ['main'],
            outputs: ['main'],
            icon: 'file:plentyone.svg',
            credentials: [
                {
                    name: 'plentymarketsApi',
                    required: true,
                },
            ],
            properties: allProperties,
        };
    }
    async execute() {
        const items = this.getInputData();
        const returnData = [];
        const credentials = await this.getCredentials('plentymarketsApi');
        const baseUrl = (credentials.baseUrl || '').replace(/\/+$/, '');
        const normalizeDataObject = (value) => {
            if (value === null || value === undefined) {
                return {};
            }
            if (typeof value === 'object') {
                return value;
            }
            return {};
        };
        for (let i = 0; i < items.length; i++) {
            const resource = this.getNodeParameter('resource', i);
            let method = 'GET';
            let endpoint = '';
            let body = {};
            let queryParams = {};
            const operation = this.getNodeParameter('operation', i);
            if (resource === 'custom') {
                const [, operationName] = operation.split('.');
                if (operationName === 'customRequest') {
                    method = this.getNodeParameter('method', i).toUpperCase();
                    endpoint = this.getNodeParameter('endpoint', i);
                    body = normalizeDataObject(this.getNodeParameter('bodyJson', i, {}));
                }
                else if (operationName === 'jsonDefinition') {
                    const requestJson = this.getNodeParameter('requestJson', i, {});
                    const requests = Array.isArray(requestJson) ? requestJson : [requestJson];
                    for (const requestDef of requests) {
                        const reqMethod = (requestDef.method ?? 'GET').toUpperCase();
                        const reqEndpoint = requestDef.endpoint ?? '';
                        if (!reqEndpoint) {
                            throw new Error('Endpoint is required in the request definition.');
                        }
                        const reqBody = normalizeDataObject(requestDef.body);
                        const reqQuery = normalizeDataObject(requestDef.query);
                        const reqHeaders = normalizeDataObject(requestDef.headers);
                        const requestOptions = {
                            method: reqMethod,
                            baseURL: baseUrl,
                            url: reqEndpoint,
                            json: true,
                        };
                        if (reqHeaders && Object.keys(reqHeaders).length) {
                            requestOptions.headers = {};
                            for (const [key, value] of Object.entries(reqHeaders)) {
                                if (value !== undefined && value !== null) {
                                    requestOptions.headers[key] = String(value);
                                }
                            }
                        }
                        if (reqQuery && Object.keys(reqQuery).length) {
                            requestOptions.qs = reqQuery;
                        }
                        if (reqBody && Object.keys(reqBody).length) {
                            if (['GET', 'HEAD'].includes(reqMethod)) {
                                requestOptions.qs = {
                                    ...(requestOptions.qs ?? {}),
                                    ...reqBody,
                                };
                            }
                            else {
                                requestOptions.body = reqBody;
                            }
                        }
                        const json = await this.helpers.httpRequestWithAuthentication.call(this, 'plentymarketsApi', requestOptions);
                        returnData.push({ json });
                    }
                    continue;
                }
                else {
                    throw new Error(`Unsupported custom operation: ${operationName}`);
                }
            }
            else {
                const [resName, opName] = operation.split('.');
                const def = resourceDefinitions.find((r) => r.resource === resName);
                const op = def?.operations.find((o) => o.value === opName);
                if (!op)
                    throw new Error(`Operation not found: ${operation}`);
                method = op.method ?? 'GET';
                endpoint = op.endpoint ?? '';
                body = {};
                queryParams = {};
                if (op.parameters) {
                    for (const param of op.parameters) {
                        const val = this.getNodeParameter(param.name, i);
                        if (endpoint.includes(`{{${param.name}}}`)) {
                            endpoint = endpoint.replace(`{{${param.name}}}`, encodeURIComponent(String(val)));
                        }
                        else {
                            if (val !== undefined &&
                                val !== null &&
                                val !== '' &&
                                !(Array.isArray(val) && val.length === 0) &&
                                !(typeof val === 'number' && val === 0 && param.default === 0)) {
                                queryParams[param.name] = val;
                            }
                        }
                    }
                }
            }
            const requestOptions = {
                method: method,
                baseURL: baseUrl,
                url: endpoint,
                json: true,
            };
            if (Object.keys(queryParams).length) {
                requestOptions.qs = queryParams;
            }
            if (body && Object.keys(body).length > 0) {
                if (['GET', 'HEAD'].includes(method)) {
                    requestOptions.qs = {
                        ...(requestOptions.qs ?? {}),
                        ...body,
                    };
                }
                else {
                    requestOptions.body = body;
                }
            }
            const json = await this.helpers.httpRequestWithAuthentication.call(this, 'plentymarketsApi', requestOptions);
            returnData.push({ json });
        }
        return this.prepareOutputData(returnData);
    }
}
exports.Plentymarkets = Plentymarkets;
