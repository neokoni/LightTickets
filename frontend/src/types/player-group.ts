import type { components } from './generated-api';

export type PlayerGroupItem = components['schemas']['PlayerGroupItem'];
export type PlayerGroupSummary = components['schemas']['PlayerGroupSummary'];
export type PlayerGroupItemsPage = components['schemas']['PlayerGroupItemsPage'];

export interface PlayerGroupItemsQuery {
  page: number;
  pageSize: number;
  q: string;
}
