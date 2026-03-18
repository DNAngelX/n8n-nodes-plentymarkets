import { Plentymarkets } from './nodes/Plentymarkets/Plentymarkets.node';
import { PlentymarketsApi } from './credentials/PlentymarketsApi.credentials';

export const nodes = [
  {
    type: 'n8n-nodes-plentymarkets.Plentymarkets',
    class: Plentymarkets,
  },
];

export const credentials = [
  {
    name: 'plentymarketsApi',
    class: PlentymarketsApi,
  },
];
