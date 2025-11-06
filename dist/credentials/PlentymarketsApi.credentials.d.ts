import { IAuthenticateGeneric, ICredentialType, INodeProperties, IHttpRequestHelper, IDataObject, Icon, ICredentialTestRequest } from 'n8n-workflow';
export declare class PlentymarketsApi implements ICredentialType {
    name: string;
    displayName: string;
    icon: Icon;
    documentationUrl: string;
    properties: INodeProperties[];
    authenticate: IAuthenticateGeneric;
    test: ICredentialTestRequest;
    preAuthentication(this: IHttpRequestHelper, credentials: IDataObject): Promise<IDataObject>;
}
