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
		const returnData = [];
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

		for (let i = 0; i < items.length; i++) {
			const resource = this.getNodeParameter('resource', i) as string;
			let method = 'GET';
			let endpoint = '';
			let body: IDataObject | IDataObject[] | undefined;
			let queryParams: IDataObject | undefined;
			const operation = this.getNodeParameter('operation', i) as string;
		
			if (resource === 'custom') {
				const [, operationName] = operation.split('.');

				if (operationName === 'customRequest') {
					method = (this.getNodeParameter('method', i) as string).toUpperCase();
					endpoint = this.getNodeParameter('endpoint', i) as string;
					body = ensureObjectOrArray(
						this.getNodeParameter('bodyJson', i, {}),
						'Payload / Query (JSON)',
					);
				} else if (operationName === 'jsonDefinition') {
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
							throw new Error('Endpoint is required in the request definition.');
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
								requestOptions.body = reqBody as IDataObject;
							}
						}

						const json = await this.helpers.httpRequestWithAuthentication.call(
							this,
							'plentymarketsApi',
							requestOptions,
						);

						returnData.push({ json });
					}

					continue;
				} else {
					throw new Error(`Unsupported custom operation: ${operationName}`);
				}
			} else {
				const [resName, opName] = operation.split('.');
				const def = resourceDefinitions.find((r) => r.resource === resName);
				const op = def?.operations.find((o) => o.value === opName);
				if (!op) throw new Error(`Operation not found: ${operation}`);
				method = op.method ?? 'GET';
				endpoint = op.endpoint ?? '';
				body = undefined;
				queryParams = {};
		
				if (op.parameters) {
					for (const param of op.parameters) {
						const val = this.getNodeParameter(param.name, i);
						if (endpoint.includes(`{{${param.name}}}`)) {
							endpoint = endpoint.replace(`{{${param.name}}}`, encodeURIComponent(String(val)));
						} else {
							if (
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
				}
			}
		
			const requestOptions: IHttpRequestOptions = {
				method: method as IHttpRequestMethods,
				baseURL: baseUrl,
				url: endpoint,
				json: true,
			};
		
			if (queryParams && Object.keys(queryParams).length) {
				requestOptions.qs = queryParams;
			}
		
			if (hasBodyContent(body)) {
				if (['GET', 'HEAD'].includes(method)) {
					const bodyQuery = bodyToQueryParams(body as IDataObject);
					requestOptions.qs = mergeQueryObjects(requestOptions.qs, bodyQuery);
				} else {
					requestOptions.body = body as IDataObject;
				}
			}
		
			const json = await this.helpers.httpRequestWithAuthentication.call(
				this,
				'plentymarketsApi',
				requestOptions,
			);
			returnData.push({ json });
		}
		

		return this.prepareOutputData(returnData);
	}
}
