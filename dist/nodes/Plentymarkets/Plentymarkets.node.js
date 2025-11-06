"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Plentymarkets = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const custom_json_1 = __importDefault(require("./operations/custom.json"));
const resourceDefinitions = [custom_json_1.default];
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
        const toDataObject = (value) => typeof value === 'object' && value !== null
            ? value
            : { value: String(value ?? '') };
        const coerceNumber = (value) => {
            if (value === null || value === undefined) {
                return undefined;
            }
            const candidate = Array.isArray(value) ? value[0] : value;
            const num = Number(candidate);
            return Number.isFinite(num) ? num : undefined;
        };
        const coerceBoolean = (value) => {
            if (value === null || value === undefined) {
                return undefined;
            }
            if (typeof value === 'boolean') {
                return value;
            }
            if (typeof value === 'number') {
                return value !== 0;
            }
            if (typeof value === 'string') {
                const normalized = value.toLowerCase();
                if (['true', '1', 'yes', 'y'].includes(normalized))
                    return true;
                if (['false', '0', 'no', 'n'].includes(normalized))
                    return false;
            }
            return undefined;
        };
        const extractPageFromQuery = (qs) => {
            if (!qs) {
                return { baseQs: undefined, startPage: 1 };
            }
            const baseQs = {};
            let startPage = 1;
            for (const [key, value] of Object.entries(qs)) {
                if (key === 'page' || key === 'page[]') {
                    const parsed = coerceNumber(value);
                    if (parsed && parsed > 0) {
                        startPage = parsed;
                    }
                }
                else {
                    baseQs[key] = value;
                }
            }
            return { baseQs: Object.keys(baseQs).length ? baseQs : undefined, startPage };
        };
        const normalizePagedResponse = (response, currentPage) => {
            if (Array.isArray(response)) {
                return { items: response.map(toDataObject), hasMore: false };
            }
            if (response && typeof response === 'object') {
                const responseObj = response;
                const entries = Array.isArray(responseObj.entries)
                    ? responseObj.entries
                    : undefined;
                if (entries) {
                    const isLastPage = coerceBoolean(responseObj.isLastPage);
                    const lastPageNumber = coerceNumber(responseObj.lastPageNumber ?? responseObj.lastPage);
                    const totalsCount = coerceNumber(responseObj.totalsCount ?? responseObj.totalCount);
                    const itemsPerPage = coerceNumber(responseObj.itemsPerPage ?? responseObj.perPage ?? entries.length);
                    let hasMore = false;
                    if (entries.length === 0) {
                        hasMore = false;
                    }
                    else if (isLastPage !== undefined) {
                        hasMore = !isLastPage;
                    }
                    else if (lastPageNumber !== undefined) {
                        hasMore = currentPage < lastPageNumber;
                    }
                    else if (totalsCount !== undefined &&
                        itemsPerPage !== undefined &&
                        itemsPerPage > 0) {
                        const maxPage = Math.ceil(totalsCount / itemsPerPage);
                        hasMore = currentPage < maxPage;
                    }
                    return {
                        items: entries.map(toDataObject),
                        hasMore,
                    };
                }
                return { items: [responseObj], hasMore: false };
            }
            return { items: [toDataObject(response)], hasMore: false };
        };
        const executeRequest = async (requestOptions, methodToUse, paginate) => {
            const upperMethod = methodToUse.toUpperCase();
            if (paginate && ['GET', 'HEAD'].includes(upperMethod)) {
                const { baseQs, startPage } = extractPageFromQuery(requestOptions.qs);
                const baseOptions = {
                    ...requestOptions,
                    qs: baseQs ? { ...baseQs } : undefined,
                };
                const aggregated = [];
                let pageNumber = startPage;
                const maxPages = 1000;
                for (let iteration = 0; iteration < maxPages; iteration++) {
                    const pageOptions = {
                        ...baseOptions,
                        qs: {
                            ...(baseOptions.qs ?? {}),
                            page: String(pageNumber),
                        },
                    };
                    const response = await this.helpers.httpRequestWithAuthentication.call(this, 'plentymarketsApi', pageOptions);
                    const { items, hasMore } = normalizePagedResponse(response, pageNumber);
                    aggregated.push(...items);
                    if (!hasMore) {
                        break;
                    }
                    if (iteration === maxPages - 1) {
                        throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Pagination aborted after 1000 pages to prevent an infinite loop.');
                    }
                    pageNumber += 1;
                }
                return aggregated;
            }
            const response = await this.helpers.httpRequestWithAuthentication.call(this, 'plentymarketsApi', requestOptions);
            return [toDataObject(response)];
        };
        const pushResults = (items) => {
            for (const item of items) {
                returnData.push({ json: item });
            }
        };
        for (let i = 0; i < items.length; i++) {
            const resource = this.getNodeParameter('resource', i);
            const operation = this.getNodeParameter('operation', i);
            if (resource === 'custom') {
                const [, operationName] = operation.split('.');
                if (operationName === 'jsonDefinition') {
                    const fetchAllPages = this.getNodeParameter('fetchAllPages', i, false);
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
                            throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Endpoint is required in the request definition.');
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
                                requestOptions.arrayFormat = 'repeat';
                            }
                            else {
                                requestOptions.body = reqBody;
                            }
                        }
                        const results = await executeRequest(requestOptions, reqMethod, fetchAllPages);
                        pushResults(results);
                    }
                    continue;
                }
                if (operationName === 'customRequest') {
                    const fetchAllPages = this.getNodeParameter('fetchAllPages', i, false);
                    const method = this.getNodeParameter('method', i).toUpperCase();
                    const endpoint = this.getNodeParameter('endpoint', i);
                    const body = ensureObjectOrArray(this.getNodeParameter('bodyJson', i, {}), 'Payload / Query (JSON)');
                    const requestOptions = {
                        method: method,
                        baseURL: baseUrl,
                        url: endpoint,
                        json: true,
                    };
                    if (hasBodyContent(body)) {
                        if (['GET', 'HEAD'].includes(method)) {
                            const bodyQuery = bodyToQueryParams(body);
                            requestOptions.qs = mergeQueryObjects(requestOptions.qs, bodyQuery);
                            requestOptions.arrayFormat = 'repeat';
                        }
                        else {
                            requestOptions.body = body;
                        }
                    }
                    const results = await executeRequest(requestOptions, method, fetchAllPages);
                    pushResults(results);
                    continue;
                }
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Unsupported custom operation: ${operation}`);
            }
            const [resName, opName] = operation.split('.');
            const resourceDefinition = resourceDefinitions.find((r) => r.resource === resName);
            const operationDefinition = resourceDefinition?.operations.find((o) => o.value === opName);
            if (!operationDefinition)
                throw new Error(`Operation not found: ${operation}`);
            const method = operationDefinition.method ?? 'GET';
            let endpoint = operationDefinition.endpoint ?? '';
            const queryParams = {};
            if (operationDefinition.parameters) {
                for (const param of operationDefinition.parameters) {
                    const val = this.getNodeParameter(param.name, i);
                    if (endpoint.includes(`{{${param.name}}}`)) {
                        endpoint = endpoint.replace(`{{${param.name}}}`, encodeURIComponent(String(val)));
                    }
                    else if (val !== undefined &&
                        val !== null &&
                        val !== '' &&
                        !(Array.isArray(val) && val.length === 0) &&
                        !(typeof val === 'number' && val === 0 && param.default === 0)) {
                        queryParams[param.name] = val;
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
            const results = await executeRequest(requestOptions, method, false);
            pushResults(results);
        }
        return this.prepareOutputData(returnData);
    }
}
exports.Plentymarkets = Plentymarkets;
