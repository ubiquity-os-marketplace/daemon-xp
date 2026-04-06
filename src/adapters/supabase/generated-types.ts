export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type DatabaseTable<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      users: DatabaseTable<
        {
          id: number;
          name: string | null;
          login: string | null;
        },
        {
          id?: number;
          name?: string | null;
          login?: string | null;
        },
        {
          id?: number;
          name?: string | null;
          login?: string | null;
        }
      >;
      locations: DatabaseTable<
        {
          id: number;
          issue_id: number;
          node_type: string;
          node_url: string | null;
        },
        {
          id?: number;
          issue_id: number;
          node_type: string;
          node_url: string | null;
        },
        {
          id?: number;
          issue_id?: number;
          node_type?: string;
          node_url?: string | null;
        }
      >;
      permits: DatabaseTable<
        {
          id: number;
          amount: string | null;
          beneficiary_id: number;
          location_id: number | null;
          token_id: number | null;
          nonce: string;
          deadline: string;
          signature: string;
          partner_id: number | null;
          locations?: { node_url: string | null } | { node_url: string | null }[] | null;
        },
        {
          id?: number;
          amount: string;
          beneficiary_id: number;
          location_id: number | null;
          token_id?: number | null;
          nonce: string;
          deadline: string;
          signature: string;
          partner_id?: number | null;
        },
        {
          id?: number;
          amount?: string | null;
          beneficiary_id?: number;
          location_id?: number | null;
          token_id?: number | null;
          nonce?: string;
          deadline?: string;
          signature?: string;
          partner_id?: number | null;
        }
      >;
      xp_penalties: DatabaseTable<
        {
          id: number;
          amount: string | null;
          beneficiary_id: number;
          location_id: number;
          locations?: { node_url: string | null } | { node_url: string | null }[] | null;
        },
        {
          id?: number;
          amount: string;
          beneficiary_id: number;
          location_id: number;
        },
        {
          id?: number;
          amount?: string | null;
          beneficiary_id?: number;
          location_id?: number;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];
