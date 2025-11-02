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

import * as fs from 'fs';
import * as path from 'path';

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

const operationsDir = path.join(__dirname, 'operations');
const resourceFiles = fs.readdirSync(operationsDir).filter(f => f.endsWith('.json'));

const seenResources = new Set<string>();
const resourceDefinitions: ResourceDefinition[] = [];

for (const file of resourceFiles) {
	const content = fs.readFileSync(path.join(operationsDir, file), 'utf-8');
	const definition = JSON.parse(content);
	if (!seenResources.has(definition.resource)) {
		resourceDefinitions.push(definition);
		seenResources.add(definition.resource);
	}
}

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
		icon: 'file:plentyone.svg',
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

					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'plentymarketsApi',
						pageOptions,
					);

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

			const response = await this.helpers.httpRequestWithAuthentication.call(
				this,
				'plentymarketsApi',
				requestOptions,
			);

			return [toDataObject(response)];
		};

		const pushResults = (items: IDataObject[]) => {
			for (const item of items) {
				returnData.push({ json: item });
			}
		};

		for (let i = 0; i < items.length; i++) {
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
							} else {
								requestOptions.body = reqBody as IDataObject | IDataObject[];
							}
						}

						const results = await executeRequest(requestOptions, reqMethod, fetchAllPages);
						pushResults(results);
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
						} else {
							requestOptions.body = body as IDataObject | IDataObject[];
						}
					}

					const results = await executeRequest(requestOptions, method, fetchAllPages);
					pushResults(results);
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
			pushResults(results);
		}

		return this.prepareOutputData(returnData);
	}
}
