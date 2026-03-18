import {
	IExecuteFunctions,
	INodeType,
	INodeTypeDescription,
	INodeProperties,
	NodeConnectionType,
	INodePropertyOptions,
	IHttpRequestOptions,
	IDataObject,
	IHttpRequestMethods,
	INodeExecutionData,
	NodeOperationError,
} from 'n8n-workflow';

const customResource: ResourceDefinition = {
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

interface OperationDefinition {
	name: string;
	value: string;
	method?: string;
	endpoint?: string;
	description?: string;
	parameters?: INodeProperties[];
}

interface ResourceDefinition {
	resource: string;
	displayName: string;
	operations: OperationDefinition[];
}

const resourceDefinitions: ResourceDefinition[] = [customResource as ResourceDefinition];

const resourceOptions: INodePropertyOptions[] = resourceDefinitions.map((r) => ({
	name: r.displayName,
	value: r.resource,
}));

const allProperties: INodeProperties[] = [
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

const operationOptions = new Set<string>();

resourceDefinitions.forEach((def) => {
	def.operations.forEach((op) => {
		const value = `${def.resource}.${op.value}`;
		if (!operationOptions.has(value)) {
			allProperties.find((p) => p.name === 'operation')!.options!.push({
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

export class Plentymarkets implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PlentyONE',
		name: 'Plentymarkets',
		group: ['transform'],
		version: 1,
		description: 'Work with the PlentyONE (formerly plentymarkets) REST API',
		defaults: {
			name: 'PlentyONE',
		},
		inputs: ['main' as NodeConnectionType],
		outputs: ['main' as NodeConnectionType],
		credentials: [
			{
				name: 'plentymarketsApi',
				required: true,
			},
		],
		properties: allProperties,
	};

	async execute(this: IExecuteFunctions) {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('plentymarketsApi');
		const baseUrl = ((credentials.baseUrl as string) || '').replace(/\/+$/, '');

		const parseJsonParameter = (value: unknown, fieldName: string): unknown => {
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
				} catch (error) {
					throw new NodeOperationError(
						this.getNode(),
						`Invalid JSON provided for "${fieldName}": ${
							(error as Error).message ?? error
						}`,
					);
				}
			}
			return value;
		};

		const ensureObject = (value: unknown, fieldName: string): IDataObject | undefined => {
			const parsed = parseJsonParameter(value, fieldName);
			if (parsed === undefined) {
				return undefined;
			}
			if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
				return parsed as IDataObject;
			}
			throw new NodeOperationError(this.getNode(), `"${fieldName}" must be a JSON object.`);
		};

		const ensureObjectOrArray = (
			value: unknown,
			fieldName: string,
		): IDataObject | IDataObject[] | undefined => {
			const parsed = parseJsonParameter(value, fieldName);
			if (parsed === undefined) {
				return undefined;
			}
			if (typeof parsed === 'object' && parsed !== null) {
				return parsed as IDataObject | IDataObject[];
			}
			throw new NodeOperationError(
				this.getNode(),
				`"${fieldName}" must be a JSON object or array.`,
			);
		};

		const hasBodyContent = (value: IDataObject | IDataObject[] | undefined): boolean => {
			if (value === undefined) {
				return false;
			}
			if (Array.isArray(value)) {
				return value.length > 0;
			}
			return Object.keys(value).length > 0;
		};

		const mergeQueryObjects = (
			target: IDataObject | undefined,
			additions: IDataObject,
		): IDataObject => {
			const aggregated: Record<string, string[]> = {};
			const pushValue = (key: string, value: unknown) => {
				if (value === undefined || value === null) {
					return;
				}
				if (!aggregated[key]) {
					aggregated[key] = [];
				}
				aggregated[key].push(String(value));
			};

			const addFromSource = (source?: IDataObject) => {
				if (!source) return;
				for (const [key, value] of Object.entries(source)) {
					if (Array.isArray(value)) {
						value.forEach((item) => pushValue(key, item));
					} else {
						pushValue(key, value);
					}
				}
			};

			addFromSource(target);
			addFromSource(additions);

			const result: IDataObject = {};
			for (const [key, values] of Object.entries(aggregated)) {
				result[key] = values.length === 1 ? values[0] : values;
			}
			return result;
		};

		const bodyToQueryParams = (input: IDataObject | IDataObject[]): IDataObject => {
			if (Array.isArray(input)) {
				throw new NodeOperationError(
					this.getNode(),
					'For GET requests the payload must be a JSON object.',
				);
			}

			const entries: Record<string, string[]> = {};

			const appendValue = (key: string, value: unknown) => {
				if (value === undefined || value === null || value === '') {
					return;
				}

				if (Array.isArray(value)) {
					value.forEach((item) => appendValue(`${key}[]`, item));
					return;
				}

				if (typeof value === 'object') {
					for (const [childKey, childValue] of Object.entries(value as IDataObject)) {
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

			const queryObject: IDataObject = {};
			for (const [key, values] of Object.entries(entries)) {
				queryObject[key] = values.length === 1 ? values[0] : values;
			}

			return queryObject;
		};

		const toDataObject = (value: unknown): IDataObject =>
			typeof value === 'object' && value !== null
				? (value as IDataObject)
				: { value: String(value ?? '') };

		const coerceNumber = (value: unknown): number | undefined => {
			if (value === null || value === undefined) {
				return undefined;
			}
			const candidate = Array.isArray(value) ? value[0] : value;
			const num = Number(candidate);
			return Number.isFinite(num) ? num : undefined;
		};

		const coerceBoolean = (value: unknown): boolean | undefined => {
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
				if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
				if (['false', '0', 'no', 'n'].includes(normalized)) return false;
			}
			return undefined;
		};

		const extractPageFromQuery = (
			qs?: IDataObject,
		): { baseQs?: IDataObject; startPage: number } => {
			if (!qs) {
				return { baseQs: undefined, startPage: 1 };
			}

			const baseQs: IDataObject = {};
			let startPage = 1;

			for (const [key, value] of Object.entries(qs)) {
				if (key === 'page' || key === 'page[]') {
					const parsed = coerceNumber(value);
					if (parsed && parsed > 0) {
						startPage = parsed;
					}
				} else {
					baseQs[key] = value;
				}
			}

			return { baseQs: Object.keys(baseQs).length ? baseQs : undefined, startPage };
		};

		const wait = async (milliseconds: number): Promise<void> => {
			if (milliseconds <= 0) {
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, milliseconds));
		};

		const toHeaderMap = (headers: unknown): Record<string, string> => {
			if (!headers || typeof headers !== 'object') {
				return {};
			}

			const map: Record<string, string> = {};
			for (const [key, value] of Object.entries(headers as IDataObject)) {
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

		const parseNumberHeader = (value: string | undefined): number | undefined => {
			if (!value) {
				return undefined;
			}
			const parsed = Number(value.trim());
			return Number.isFinite(parsed) ? parsed : undefined;
		};

		const parseRetryAfterMs = (value: string | undefined): number | undefined => {
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

		const parseResetTimestampMs = (value: string | undefined): number | undefined => {
			if (!value) {
				return undefined;
			}

			const numeric = Number(value.trim());
			if (Number.isFinite(numeric)) {
				// Plenty sends timestamps in seconds for `Calls-Reset`.
				const timestampMs = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
				return Math.max(0, timestampMs - Date.now());
			}

			const parsedDate = Date.parse(value);
			if (Number.isNaN(parsedDate)) {
				return undefined;
			}

			return Math.max(0, parsedDate - Date.now());
		};

		const parseDecayMs = (value: string | undefined): number | undefined => {
			const seconds = parseNumberHeader(value);
			if (seconds === undefined) {
				return undefined;
			}
			return Math.max(0, Math.ceil(seconds * 1000));
		};

		const computeRateLimitWaitMs = (headers: Record<string, string>): number => {
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
				} else if (decayMs !== undefined) {
					waitMs = Math.max(waitMs, decayMs);
				}
			}

			const genericRemaining = parseNumberHeader(
				headers['x-ratelimit-remaining'] ??
					headers['x-rate-limit-remaining'] ??
					headers['ratelimit-remaining'],
			);

			if (genericRemaining !== undefined && genericRemaining <= 0) {
				const resetMs = parseResetTimestampMs(
					headers['x-ratelimit-reset'] ??
						headers['x-rate-limit-reset'] ??
						headers['ratelimit-reset'],
				);
				if (resetMs !== undefined) {
					waitMs = Math.max(waitMs, resetMs);
				}
			}

			return waitMs;
		};

		let nextRequestAllowedAtMs = 0;

		const waitForRateLimitIfNeeded = async (): Promise<void> => {
			const now = Date.now();
			if (nextRequestAllowedAtMs > now) {
				await wait(nextRequestAllowedAtMs - now);
			}
		};

		const requestWithRateLimitHandling = async (
			requestOptions: IHttpRequestOptions,
		): Promise<unknown> => {
			await waitForRateLimitIfNeeded();

			const response = await this.helpers.httpRequestWithAuthentication.call(
				this,
				'plentymarketsApi',
				{
					...requestOptions,
					returnFullResponse: true,
				},
			);

			const fullResponse = response as IDataObject;
			const headers = toHeaderMap(fullResponse.headers);
			const waitMs = computeRateLimitWaitMs(headers);

			if (waitMs > 0) {
				// Small buffer prevents edge cases when reset timestamps are rounded.
				nextRequestAllowedAtMs = Date.now() + waitMs + 100;
			}

			return fullResponse.body;
		};

		const normalizePagedResponse = (
			response: unknown,
			currentPage: number,
		): { items: IDataObject[]; hasMore: boolean } => {
			if (Array.isArray(response)) {
				return { items: (response as unknown[]).map(toDataObject), hasMore: false };
			}

			if (response && typeof response === 'object') {
				const responseObj = response as IDataObject;
				const entries = Array.isArray(responseObj.entries)
					? (responseObj.entries as IDataObject[])
					: undefined;

				if (entries) {
					const isLastPage = coerceBoolean(responseObj.isLastPage);
					const lastPageNumber = coerceNumber(responseObj.lastPageNumber ?? responseObj.lastPage);
					const totalsCount = coerceNumber(responseObj.totalsCount ?? responseObj.totalCount);
					const itemsPerPage = coerceNumber(
						responseObj.itemsPerPage ?? responseObj.perPage ?? entries.length,
					);

					let hasMore = false;

					if (entries.length === 0) {
						hasMore = false;
					} else if (isLastPage !== undefined) {
						hasMore = !isLastPage;
					} else if (lastPageNumber !== undefined) {
						hasMore = currentPage < lastPageNumber;
					} else if (
						totalsCount !== undefined &&
						itemsPerPage !== undefined &&
						itemsPerPage > 0
					) {
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

		const executeRequest = async (
			requestOptions: IHttpRequestOptions,
			methodToUse: string,
			paginate: boolean,
		): Promise<IDataObject[]> => {
			const upperMethod = methodToUse.toUpperCase();

			if (paginate && ['GET', 'HEAD'].includes(upperMethod)) {
				const { baseQs, startPage } = extractPageFromQuery(requestOptions.qs);
				const baseOptions: IHttpRequestOptions = {
					...requestOptions,
					qs: baseQs ? { ...baseQs } : undefined,
				};

				const aggregated: IDataObject[] = [];
				let pageNumber = startPage;
				const maxPages = 1000;

				for (let iteration = 0; iteration < maxPages; iteration++) {
					const pageOptions: IHttpRequestOptions = {
						...baseOptions,
						qs: {
							...(baseOptions.qs ?? {}),
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
						throw new NodeOperationError(
							this.getNode(),
							'Pagination aborted after 1000 pages to prevent an infinite loop.',
						);
					}

					pageNumber += 1;
				}

				return aggregated;
			}

			const response = await requestWithRateLimitHandling(requestOptions);

			return [toDataObject(response)];
		};

		const pushResults = (items: IDataObject[], itemIndex: number) => {
			for (const item of items) {
				returnData.push({ json: item, pairedItem: { item: itemIndex } });
			}
		};

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				if (resource === 'custom') {
					const [, operationName] = operation.split('.');

					if (operationName === 'jsonDefinition') {
						const fetchAllPages = this.getNodeParameter('fetchAllPages', i, false) as boolean;
						const requestJsonRaw = this.getNodeParameter('requestJson', i, {}) as unknown;
						const parsedRequestJson = parseJsonParameter(
							requestJsonRaw,
							'Request Definition (JSON)',
						);

						if (
							parsedRequestJson === undefined ||
							(typeof parsedRequestJson !== 'object' && !Array.isArray(parsedRequestJson))
						) {
							throw new NodeOperationError(
								this.getNode(),
								'Request definition must be a JSON object or array.',
							);
						}

						const requests = Array.isArray(parsedRequestJson)
							? (parsedRequestJson as IDataObject[])
							: [parsedRequestJson as IDataObject];

						for (const requestDef of requests) {
							const reqMethod = (
								(requestDef.method as string | undefined) ?? 'GET'
							).toUpperCase();
							const reqEndpoint = requestDef.endpoint as string | undefined;

							if (!reqEndpoint) {
								throw new NodeOperationError(
									this.getNode(),
									'Endpoint is required in the request definition.',
								);
							}

							const reqBody = ensureObjectOrArray(requestDef.body, 'body');
							const reqQuery = ensureObject(requestDef.query, 'query');
							const reqHeaders = ensureObject(requestDef.headers, 'headers');

							const requestOptions: IHttpRequestOptions = {
								method: reqMethod as IHttpRequestMethods,
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
									const bodyQuery = bodyToQueryParams(reqBody as IDataObject);
									requestOptions.qs = mergeQueryObjects(requestOptions.qs, bodyQuery);
									requestOptions.arrayFormat = 'repeat';
								} else {
									requestOptions.body = reqBody as IDataObject | IDataObject[];
								}
							}

							const results = await executeRequest(requestOptions, reqMethod, fetchAllPages);
							pushResults(results, i);
						}

						continue;
					}

					if (operationName === 'customRequest') {
						const fetchAllPages = this.getNodeParameter('fetchAllPages', i, false) as boolean;
						const method = (this.getNodeParameter('method', i) as string).toUpperCase();
						const endpoint = this.getNodeParameter('endpoint', i) as string;
						const body = ensureObjectOrArray(
							this.getNodeParameter('bodyJson', i, {}),
							'Payload / Query (JSON)',
						);

						const requestOptions: IHttpRequestOptions = {
							method: method as IHttpRequestMethods,
							baseURL: baseUrl,
							url: endpoint,
							json: true,
						};

						if (hasBodyContent(body)) {
							if (['GET', 'HEAD'].includes(method)) {
								const bodyQuery = bodyToQueryParams(body as IDataObject);
								requestOptions.qs = mergeQueryObjects(requestOptions.qs, bodyQuery);
								requestOptions.arrayFormat = 'repeat';
							} else {
								requestOptions.body = body as IDataObject | IDataObject[];
							}
						}

						const results = await executeRequest(requestOptions, method, fetchAllPages);
						pushResults(results, i);
						continue;
					}

					throw new NodeOperationError(
						this.getNode(),
						`Unsupported custom operation: ${operation}`,
					);
				}

				const [resName, opName] = operation.split('.');
				const resourceDefinition = resourceDefinitions.find((r) => r.resource === resName);
				const operationDefinition = resourceDefinition?.operations.find((o) => o.value === opName);
				if (!operationDefinition) throw new Error(`Operation not found: ${operation}`);

				const method = operationDefinition.method ?? 'GET';
				let endpoint = operationDefinition.endpoint ?? '';
				const queryParams: IDataObject = {};

				if (operationDefinition.parameters) {
					for (const param of operationDefinition.parameters) {
						const val = this.getNodeParameter(param.name, i);
						if (endpoint.includes(`{{${param.name}}}`)) {
							endpoint = endpoint.replace(`{{${param.name}}}`, encodeURIComponent(String(val)));
						} else if (
							val !== undefined &&
							val !== null &&
							val !== '' &&
							!(Array.isArray(val) && val.length === 0) &&
							!(typeof val === 'number' && val === 0 && param.default === 0)
						) {
							queryParams[param.name] = val;
						}
					}
				}

				const requestOptions: IHttpRequestOptions = {
					method: method as IHttpRequestMethods,
					baseURL: baseUrl,
					url: endpoint,
					json: true,
				};

				if (Object.keys(queryParams).length) {
					requestOptions.qs = queryParams;
				}

				const results = await executeRequest(requestOptions, method, false);
				pushResults(results, i);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				if (error instanceof NodeOperationError) {
					throw error;
				}
				throw new NodeOperationError(this.getNode(), error as Error);
			}
		}

		return this.prepareOutputData(returnData);
	}
}
