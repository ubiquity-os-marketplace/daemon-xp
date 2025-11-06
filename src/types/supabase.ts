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
};

export type SupabaseAdapterContract = {
  location: {
    getOrCreateIssueLocation: (issue: IssueLocationInput) => Promise<number>;
  };
  xp: {
    saveRecord: (input: SaveXpRecordInput) => Promise<void>;
    getUserTotal: (userId: number) => Promise<UserXpTotal>;
  };
};
