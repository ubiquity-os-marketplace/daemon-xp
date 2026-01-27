export type IssueLocationInput = {
  issueId: number;
  issueUrl: string;
};

export type SaveXpRecordInput = {
  userId: number;
  issue: IssueLocationInput;
  numericAmount: number;
};

export type UserXpTotal = {
  total: number;
  permitCount: number;
  scopes?: {
    global: number;
    repo?: number;
    org?: number;
  };
};

export type UserXpScopeOptions = {
  repositoryOwner?: string;
  repositoryName?: string;
  organizationLogin?: string;
};

export type SupabaseAdapterContract = {
  location: {
    getOrCreateIssueLocation: (issue: IssueLocationInput) => Promise<number>;
  };
  xp: {
    saveRecord: (input: SaveXpRecordInput) => Promise<void>;
    getUserTotal: (userId: number, options?: UserXpScopeOptions) => Promise<UserXpTotal>;
  };
};
