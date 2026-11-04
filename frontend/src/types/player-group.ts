export type PlayerGroupItem = {
  id: string;
  groupId: string;
  value: string;
  createdAt: string;
  updatedAt: string;
};
export type PlayerGroupSummary = {
  id: string;
  name: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    items: number;
  };
};
export type PlayerGroupItemsPage = {
  group: PlayerGroupSummary;
  items: PlayerGroupItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type PlayerGroupItemsQuery = {
  page: number;
  pageSize: number;
  q: string;
};
