export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          payload: Json | null
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          payload?: Json | null
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          payload?: Json | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      finder_candidates: {
        Row: {
          address: string | null
          category: string | null
          created_at: string
          email: string | null
          has_phone: boolean | null
          has_website: boolean | null
          id: string
          last_fetched_at: string | null
          maps_url: string | null
          name: string
          outcome: string
          phone: string | null
          place_id: string
          rating: number | null
          reviews_count: number | null
          run_id: string
          types: string[] | null
          website: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          created_at?: string
          email?: string | null
          has_phone?: boolean | null
          has_website?: boolean | null
          id?: string
          last_fetched_at?: string | null
          maps_url?: string | null
          name: string
          outcome?: string
          phone?: string | null
          place_id: string
          rating?: number | null
          reviews_count?: number | null
          run_id: string
          types?: string[] | null
          website?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          created_at?: string
          email?: string | null
          has_phone?: boolean | null
          has_website?: boolean | null
          id?: string
          last_fetched_at?: string | null
          maps_url?: string | null
          name?: string
          outcome?: string
          phone?: string | null
          place_id?: string
          rating?: number | null
          reviews_count?: number | null
          run_id?: string
          types?: string[] | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finder_candidates_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "finder_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      finder_runs: {
        Row: {
          city: string
          created_at: string
          id: string
          keywords: string[]
          max_candidates: number
          max_details: number
          max_pages: number
          min_rating: number | null
          min_reviews: number | null
          mode: string
          radius: number
          require_phone: boolean
          stats: Json
          status: string
          updated_at: string
        }
        Insert: {
          city: string
          created_at?: string
          id?: string
          keywords?: string[]
          max_candidates?: number
          max_details?: number
          max_pages?: number
          min_rating?: number | null
          min_reviews?: number | null
          mode?: string
          radius?: number
          require_phone?: boolean
          stats?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          keywords?: string[]
          max_candidates?: number
          max_details?: number
          max_pages?: number
          min_rating?: number | null
          min_reviews?: number | null
          mode?: string
          radius?: number
          require_phone?: boolean
          stats?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          address: string | null
          call_outcome_last: string | null
          category: string | null
          created_at: string
          email: string | null
          id: string
          maps_url: string | null
          name: string
          next_action_at: string | null
          niche_label: string | null
          notes: string | null
          phone: string | null
          place_id: string | null
          rating: number | null
          reviews_count: number | null
          section: string
          status: string
          tags: string[] | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          call_outcome_last?: string | null
          category?: string | null
          created_at?: string
          email?: string | null
          id?: string
          maps_url?: string | null
          name: string
          next_action_at?: string | null
          niche_label?: string | null
          notes?: string | null
          phone?: string | null
          place_id?: string | null
          rating?: number | null
          reviews_count?: number | null
          section?: string
          status?: string
          tags?: string[] | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          call_outcome_last?: string | null
          category?: string | null
          created_at?: string
          email?: string | null
          id?: string
          maps_url?: string | null
          name?: string
          next_action_at?: string | null
          niche_label?: string | null
          notes?: string | null
          phone?: string | null
          place_id?: string | null
          rating?: number | null
          reviews_count?: number | null
          section?: string
          status?: string
          tags?: string[] | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      place_cache: {
        Row: {
          address: string | null
          category: string | null
          email: string | null
          fetched_at: string
          maps_url: string | null
          name: string
          phone: string | null
          place_id: string
          rating: number | null
          reviews_count: number | null
          types: string[] | null
          website: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          email?: string | null
          fetched_at?: string
          maps_url?: string | null
          name: string
          phone?: string | null
          place_id: string
          rating?: number | null
          reviews_count?: number | null
          types?: string[] | null
          website?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          email?: string | null
          fetched_at?: string
          maps_url?: string | null
          name?: string
          phone?: string | null
          place_id?: string
          rating?: number | null
          reviews_count?: number | null
          types?: string[] | null
          website?: string | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
