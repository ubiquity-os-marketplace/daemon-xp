export type IssueLocationInput = {
  issueId: number;
  issueUrl: string;
};

export type SaveXpRecordInput = {
  userId: number;
  issue: IssueLocationInput;
  numericAmount: number;
};

export type SupabaseAdapterContract = {
  location: {
    getOrCreateIssueLocation: (issue: IssueLocationInput) => Promise<number>;
  };
  xp: {
    saveRecord: (input: SaveXpRecordInput) => Promise<void>;
  };
};
