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
const n8n_workflow_1 = require("n8n-workflow");
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
        const parseJsonParameter = (value, fieldName) => {
            if (value === null || value === undefined || value === '') {
                return undefined;
            }
            if (typeof value === 'string') {
                const trimmed = value.trim();
                if (!trimmed) {
                    return undefined;
                }
                try {
                    return JSON.parse(trimmed);
                }
                catch (error) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Invalid JSON provided for "${fieldName}": ${error.message ?? error}`);
                }
            }
            return value;
        };
        const ensureObject = (value, fieldName) => {
            const parsed = parseJsonParameter(value, fieldName);
            if (parsed === undefined) {
                return undefined;
            }
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                return parsed;
            }
            throw new n8n_workflow_1.NodeOperationError(this.getNode(), `"${fieldName}" must be a JSON object.`);
        };
        const ensureObjectOrArray = (value, fieldName) => {
            const parsed = parseJsonParameter(value, fieldName);
            if (parsed === undefined) {
                return undefined;
            }
            if (typeof parsed === 'object' && parsed !== null) {
                return parsed;
            }
            throw new n8n_workflow_1.NodeOperationError(this.getNode(), `"${fieldName}" must be a JSON object or array.`);
        };
        const hasBodyContent = (value) => {
            if (value === undefined) {
                return false;
            }
            if (Array.isArray(value)) {
                return value.length > 0;
            }
            return Object.keys(value).length > 0;
        };
        const mergeQueryObjects = (target, additions) => {
            const aggregated = {};
            const pushValue = (key, value) => {
                if (value === undefined || value === null) {
                    return;
                }
                if (!aggregated[key]) {
                    aggregated[key] = [];
                }
                aggregated[key].push(String(value));
            };
            const addFromSource = (source) => {
                if (!source)
                    return;
                for (const [key, value] of Object.entries(source)) {
                    if (Array.isArray(value)) {
                        value.forEach((item) => pushValue(key, item));
                    }
                    else {
                        pushValue(key, value);
                    }
                }
            };
            addFromSource(target);
            addFromSource(additions);
            const result = {};
            for (const [key, values] of Object.entries(aggregated)) {
                result[key] = values.length === 1 ? values[0] : values;
            }
            return result;
        };
        const bodyToQueryParams = (input) => {
            if (Array.isArray(input)) {
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'For GET requests the payload must be a JSON object.');
            }
            const entries = {};
            const appendValue = (key, value) => {
                if (value === undefined || value === null || value === '') {
                    return;
                }
                if (Array.isArray(value)) {
                    value.forEach((item) => appendValue(`${key}[]`, item));
                    return;
                }
                if (typeof value === 'object') {
                    for (const [childKey, childValue] of Object.entries(value)) {
                        const nextKey = key ? `${key}[${childKey}]` : childKey;
                        appendValue(nextKey, childValue);
                    }
                    return;
                }
                const stringValue = String(value);
                if (!entries[key]) {
                    entries[key] = [];
                }
                entries[key].push(stringValue);
            };
            for (const [key, value] of Object.entries(input)) {
                appendValue(key, value);
            }
            const queryObject = {};
            for (const [key, values] of Object.entries(entries)) {
                queryObject[key] = values.length === 1 ? values[0] : values;
            }
            return queryObject;
        };
        for (let i = 0; i < items.length; i++) {
            const resource = this.getNodeParameter('resource', i);
            let method = 'GET';
            let endpoint = '';
            let body;
            let queryParams;
            const operation = this.getNodeParameter('operation', i);
            if (resource === 'custom') {
                const [, operationName] = operation.split('.');
                if (operationName === 'customRequest') {
                    method = this.getNodeParameter('method', i).toUpperCase();
                    endpoint = this.getNodeParameter('endpoint', i);
                    body = ensureObjectOrArray(this.getNodeParameter('bodyJson', i, {}), 'Payload / Query (JSON)');
                }
                else if (operationName === 'jsonDefinition') {
                    const requestJsonRaw = this.getNodeParameter('requestJson', i, {});
                    const parsedRequestJson = parseJsonParameter(requestJsonRaw, 'Request Definition (JSON)');
                    if (parsedRequestJson === undefined ||
                        (typeof parsedRequestJson !== 'object' && !Array.isArray(parsedRequestJson))) {
                        throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Request definition must be a JSON object or array.');
                    }
                    const requests = Array.isArray(parsedRequestJson)
                        ? parsedRequestJson
                        : [parsedRequestJson];
                    for (const requestDef of requests) {
                        const reqMethod = (requestDef.method ?? 'GET').toUpperCase();
                        const reqEndpoint = requestDef.endpoint;
                        if (!reqEndpoint) {
                            throw new Error('Endpoint is required in the request definition.');
                        }
                        const reqBody = ensureObjectOrArray(requestDef.body, 'body');
                        const reqQuery = ensureObject(requestDef.query, 'query');
                        const reqHeaders = ensureObject(requestDef.headers, 'headers');
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
                        if (hasBodyContent(reqBody)) {
                            if (['GET', 'HEAD'].includes(reqMethod)) {
                                const bodyQuery = bodyToQueryParams(reqBody);
                                requestOptions.qs = mergeQueryObjects(requestOptions.qs, bodyQuery);
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
                body = undefined;
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
            if (queryParams && Object.keys(queryParams).length) {
                requestOptions.qs = queryParams;
            }
            if (hasBodyContent(body)) {
                if (['GET', 'HEAD'].includes(method)) {
                    const bodyQuery = bodyToQueryParams(body);
                    requestOptions.qs = mergeQueryObjects(requestOptions.qs, bodyQuery);
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
