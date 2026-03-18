"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Plentymarkets = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const customResource = {
    resource: 'custom',
    displayName: 'Custom API Call',
    operations: [
        {
            name: 'Custom Request',
            value: 'customRequest',
            description: 'Send a custom HTTP request',
            method: 'GET',
            endpoint: '{{endpoint}}',
            parameters: [
                {
                    displayName: 'HTTP Method',
                    name: 'method',
                    type: 'options',
                    options: [
                        { name: 'GET', value: 'GET' },
                        { name: 'POST', value: 'POST' },
                        { name: 'PUT', value: 'PUT' },
                        { name: 'PATCH', value: 'PATCH' },
                        { name: 'DELETE', value: 'DELETE' },
                    ],
                    default: 'GET',
                },
                {
                    displayName: 'Endpoint',
                    name: 'endpoint',
                    type: 'string',
                    default: '/rest/orders',
                },
                {
                    displayName: 'Payload / Query (JSON)',
                    name: 'bodyJson',
                    type: 'json',
                    default: '{}',
                    description: 'For GET/HEAD requests, sends as query parameters; otherwise sends as JSON body',
                },
                {
                    displayName: 'Fetch All Pages',
                    name: 'fetchAllPages',
                    type: 'boolean',
                    default: false,
                    description: 'Automatically paginate GET responses until the last page is reached',
                    displayOptions: {
                        show: {
                            method: ['GET'],
                        },
                    },
                },
            ],
        },
        {
            name: 'Request via JSON Definition',
            value: 'jsonDefinition',
            description: 'Provide a full JSON definition for the request',
            method: 'GET',
            endpoint: '{{endpoint}}',
            parameters: [
                {
                    displayName: 'Request Definition (JSON)',
                    name: 'requestJson',
                    type: 'json',
                    default: '{}',
                    description: 'Fields: method, endpoint, body, query, headers. You can also pass an array of requests.',
                },
                {
                    displayName: 'Fetch All Pages',
                    name: 'fetchAllPages',
                    type: 'boolean',
                    default: false,
                    description: 'Automatically paginate GET responses until the last page is reached.',
                },
            ],
        },
    ],
};
const resourceDefinitions = [customResource];
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
        var _a;
        const value = `${def.resource}.${op.value}`;
        if (!operationOptions.has(value)) {
            allProperties.find((p) => p.name === 'operation').options.push({
                name: op.name,
                value,
                description: (_a = op.description) !== null && _a !== void 0 ? _a : '',
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
            icon: 'file:plentyone.svg',
            description: 'Work with the PlentyONE (formerly plentymarkets) REST API',
            defaults: {
                name: 'PlentyONE',
            },
            inputs: ['main'],
            outputs: ['main'],
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
        var _a, _b, _c;
        const items = this.getInputData();
        const returnData = [];
        const credentials = await this.getCredentials('plentymarketsApi');
        const baseUrl = (credentials.baseUrl || '').replace(/\/+$/, '');
        const parseJsonParameter = (value, fieldName) => {
            var _a;
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
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Invalid JSON provided for "${fieldName}": ${(_a = error.message) !== null && _a !== void 0 ? _a : error}`);
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
            : { value: String(value !== null && value !== void 0 ? value : '') };
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
        const toHeaderMap = (headers) => {
            if (!headers || typeof headers !== 'object') {
                return {};
            }
            const map = {};
            for (const [key, value] of Object.entries(headers)) {
                if (value === undefined || value === null) {
                    continue;
                }
                const normalizedKey = key.toLowerCase();
                map[normalizedKey] = Array.isArray(value)
                    ? value.map((item) => String(item)).join(',')
                    : String(value);
            }
            return map;
        };
        const parseNumberHeader = (value) => {
            if (!value) {
                return undefined;
            }
            const parsed = Number(value.trim());
            return Number.isFinite(parsed) ? parsed : undefined;
        };
        const parseRetryAfterMs = (value) => {
            if (!value) {
                return undefined;
            }
            const numeric = Number(value.trim());
            if (Number.isFinite(numeric)) {
                return Math.max(0, Math.ceil(numeric * 1000));
            }
            const retryAt = Date.parse(value);
            if (Number.isNaN(retryAt)) {
                return undefined;
            }
            return Math.max(0, retryAt - Date.now());
        };
        const parseResetTimestampMs = (value) => {
            if (!value) {
                return undefined;
            }
            const numeric = Number(value.trim());
            if (Number.isFinite(numeric)) {
                // Plenty sends timestamps in seconds for `Calls-Reset`.
                const timestampMs = numeric > 1000000000000 ? numeric : numeric * 1000;
                return Math.max(0, timestampMs - Date.now());
            }
            const parsedDate = Date.parse(value);
            if (Number.isNaN(parsedDate)) {
                return undefined;
            }
            return Math.max(0, parsedDate - Date.now());
        };
        const parseDecayMs = (value) => {
            const seconds = parseNumberHeader(value);
            if (seconds === undefined) {
                return undefined;
            }
            return Math.max(0, Math.ceil(seconds * 1000));
        };
        const computeRateLimitWaitMs = (headers) => {
            var _a, _b, _c, _d;
            let waitMs = 0;
            const retryAfterMs = parseRetryAfterMs(headers['retry-after']);
            if (retryAfterMs !== undefined) {
                waitMs = Math.max(waitMs, retryAfterMs);
            }
            for (const [key, rawValue] of Object.entries(headers)) {
                if (!key.endsWith('-calls-left')) {
                    continue;
                }
                const callsLeft = parseNumberHeader(rawValue);
                if (callsLeft === undefined || callsLeft > 0) {
                    continue;
                }
                const prefix = key.slice(0, -'-calls-left'.length);
                const resetMs = parseResetTimestampMs(headers[`${prefix}-calls-reset`]);
                const decayMs = parseDecayMs(headers[`${prefix}-decay`]);
                if (resetMs !== undefined) {
                    waitMs = Math.max(waitMs, resetMs);
                }
                else if (decayMs !== undefined) {
                    waitMs = Math.max(waitMs, decayMs);
                }
            }
            const genericRemaining = parseNumberHeader((_b = (_a = headers['x-ratelimit-remaining']) !== null && _a !== void 0 ? _a : headers['x-rate-limit-remaining']) !== null && _b !== void 0 ? _b : headers['ratelimit-remaining']);
            if (genericRemaining !== undefined && genericRemaining <= 0) {
                const resetMs = parseResetTimestampMs((_d = (_c = headers['x-ratelimit-reset']) !== null && _c !== void 0 ? _c : headers['x-rate-limit-reset']) !== null && _d !== void 0 ? _d : headers['ratelimit-reset']);
                if (resetMs !== undefined) {
                    waitMs = Math.max(waitMs, resetMs);
                }
            }
            return waitMs;
        };
        let nextRequestAllowedAtMs = 0;
        const waitForRateLimitIfNeeded = async () => {
            const now = Date.now();
            if (nextRequestAllowedAtMs > now) {
                await (0, n8n_workflow_1.sleep)(nextRequestAllowedAtMs - now);
            }
        };
        const requestWithRateLimitHandling = async (requestOptions) => {
            await waitForRateLimitIfNeeded();
            const response = await this.helpers.httpRequestWithAuthentication.call(this, 'plentymarketsApi', {
                ...requestOptions,
                returnFullResponse: true,
            });
            const fullResponse = response;
            const headers = toHeaderMap(fullResponse.headers);
            const waitMs = computeRateLimitWaitMs(headers);
            if (waitMs > 0) {
                // Small buffer prevents edge cases when reset timestamps are rounded.
                nextRequestAllowedAtMs = Date.now() + waitMs + 100;
            }
            return fullResponse.body;
        };
        const normalizePagedResponse = (response, currentPage) => {
            var _a, _b, _c, _d;
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
                    const lastPageNumber = coerceNumber((_a = responseObj.lastPageNumber) !== null && _a !== void 0 ? _a : responseObj.lastPage);
                    const totalsCount = coerceNumber((_b = responseObj.totalsCount) !== null && _b !== void 0 ? _b : responseObj.totalCount);
                    const itemsPerPage = coerceNumber((_d = (_c = responseObj.itemsPerPage) !== null && _c !== void 0 ? _c : responseObj.perPage) !== null && _d !== void 0 ? _d : entries.length);
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
            var _a;
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
                            ...((_a = baseOptions.qs) !== null && _a !== void 0 ? _a : {}),
                            page: String(pageNumber),
                        },
                    };
                    const response = await requestWithRateLimitHandling(pageOptions);
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
            const response = await requestWithRateLimitHandling(requestOptions);
            return [toDataObject(response)];
        };
        const pushResults = (items, itemIndex) => {
            for (const item of items) {
                returnData.push({ json: item, pairedItem: { item: itemIndex } });
            }
        };
        for (let i = 0; i < items.length; i++) {
            try {
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
                            const reqMethod = ((_a = requestDef.method) !== null && _a !== void 0 ? _a : 'GET').toUpperCase();
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
                            pushResults(results, i);
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
                        pushResults(results, i);
                        continue;
                    }
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Unsupported custom operation: ${operation}`);
                }
                const [resName, opName] = operation.split('.');
                const resourceDefinition = resourceDefinitions.find((r) => r.resource === resName);
                const operationDefinition = resourceDefinition === null || resourceDefinition === void 0 ? void 0 : resourceDefinition.operations.find((o) => o.value === opName);
                if (!operationDefinition)
                    throw new Error(`Operation not found: ${operation}`);
                const method = (_b = operationDefinition.method) !== null && _b !== void 0 ? _b : 'GET';
                let endpoint = (_c = operationDefinition.endpoint) !== null && _c !== void 0 ? _c : '';
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
                pushResults(results, i);
            }
            catch (error) {
                if (this.continueOnFail()) {
                    returnData.push({
                        json: { error: error.message },
                        pairedItem: { item: i },
                    });
                    continue;
                }
                if (error instanceof n8n_workflow_1.NodeOperationError) {
                    throw error;
                }
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), error);
            }
        }
        return this.prepareOutputData(returnData);
    }
}
exports.Plentymarkets = Plentymarkets;
//# sourceMappingURL=Plentymarkets.node.js.map