import {dataset as prior} from './data-v3.mjs';
import {additions} from './tokyo-expansion.mjs';

// Preserve the previous exact payload; append only independently verified offers.
export const dataset=structuredClone(prior);
dataset.version='2026-10-21.tokyo-v4';
dataset.previousVersion=prior.version;
dataset.checkedAt='2026-10-21';
dataset.evidenceVersions=[...prior.evidenceVersions,dataset.version];
for(const key of ['providers','offers','rules','tariffs','sources']){
 dataset[key].push(...structuredClone(additions[key]));
}
