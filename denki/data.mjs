import {dataset as prior} from './data-v4.mjs';
import * as additions from './octopus.mjs';

// Preserve the previous exact payload; append only independently verified offers.
export const dataset=structuredClone(prior);
dataset.version='2026-10-21.tokyo-v5';
dataset.previousVersion=prior.version;
dataset.checkedAt='2026-10-21';
dataset.evidenceVersions=[...prior.evidenceVersions,dataset.version];
for(const key of ['offers','rules','tariffs','sources']){
 dataset[key].push(...structuredClone(additions[key]));
}
dataset.exclusions=dataset.exclusions.filter(item=>item.planId!=='octopus-green');
dataset.exclusions.push({planId:'octopus-green-202610',areaId:'tokyo',reason:'launch_month_full_cycle_unverified'});
