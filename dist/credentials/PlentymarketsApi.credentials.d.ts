import { IAuthenticateGeneric, ICredentialType, INodeProperties, IHttpRequestHelper, IDataObject, Icon } from 'n8n-workflow';
export declare class PlentymarketsApi implements ICredentialType {
    name: string;
    displayName: string;
    icon: Icon;
    documentationUrl: string;
    properties: INodeProperties[];
    authenticate: IAuthenticateGeneric;
    preAuthentication(this: IHttpRequestHelper, credentials: IDataObject): Promise<IDataObject>;
}
