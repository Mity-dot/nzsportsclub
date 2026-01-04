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
      attendance: {
        Row: {
          attended: boolean | null
          id: string
          marked_at: string
          marked_by: string
          user_id: string
          workout_id: string
        }
        Insert: {
          attended?: boolean | null
          id?: string
          marked_at?: string
          marked_by: string
          user_id: string
          workout_id: string
        }
        Update: {
          attended?: boolean | null
          id?: string
          marked_at?: string
          marked_by?: string
          user_id?: string
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          created_at: string
          id: string
          is_sent: boolean | null
          message: string
          message_bg: string | null
          notification_type: string
          scheduled_for: string | null
          user_id: string
          workout_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_sent?: boolean | null
          message: string
          message_bg?: string | null
          notification_type: string
          scheduled_for?: string | null
          user_id: string
          workout_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_sent?: boolean | null
          message?: string
          message_bg?: string | null
          notification_type?: string
          scheduled_for?: string | null
          user_id?: string
          workout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_staff_approvals: {
        Row: {
          approval_token: string | null
          email: string
          full_name: string | null
          id: string
          is_processed: boolean | null
          requested_at: string
          user_id: string
        }
        Insert: {
          approval_token?: string | null
          email: string
          full_name?: string | null
          id?: string
          is_processed?: boolean | null
          requested_at?: string
          user_id: string
        }
        Update: {
          approval_token?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_processed?: boolean | null
          requested_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          card_image_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_regular_attendee: boolean | null
          member_type: Database["public"]["Enums"]["member_type"]
          phone: string | null
          preferred_language: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          card_image_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          is_regular_attendee?: boolean | null
          member_type?: Database["public"]["Enums"]["member_type"]
          phone?: string | null
          preferred_language?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          card_image_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_regular_attendee?: boolean | null
          member_type?: Database["public"]["Enums"]["member_type"]
          phone?: string | null
          preferred_language?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reservations: {
        Row: {
          cancelled_at: string | null
          id: string
          is_active: boolean | null
          reserved_at: string
          user_id: string
          workout_id: string
        }
        Insert: {
          cancelled_at?: string | null
          id?: string
          is_active?: boolean | null
          reserved_at?: string
          user_id: string
          workout_id: string
        }
        Update: {
          cancelled_at?: string | null
          id?: string
          is_active?: boolean | null
          reserved_at?: string
          user_id?: string
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          is_approved: boolean | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workouts: {
        Row: {
          card_priority_enabled: boolean | null
          created_at: string
          created_by: string
          description: string | null
          description_bg: string | null
          end_time: string
          id: string
          max_spots: number
          start_time: string
          title: string
          title_bg: string | null
          updated_at: string
          workout_date: string
        }
        Insert: {
          card_priority_enabled?: boolean | null
          created_at?: string
          created_by: string
          description?: string | null
          description_bg?: string | null
          end_time: string
          id?: string
          max_spots?: number
          start_time: string
          title: string
          title_bg?: string | null
          updated_at?: string
          workout_date: string
        }
        Update: {
          card_priority_enabled?: boolean | null
          created_at?: string
          created_by?: string
          description?: string | null
          description_bg?: string | null
          end_time?: string
          id?: string
          max_spots?: number
          start_time?: string
          title?: string
          title_bg?: string | null
          updated_at?: string
          workout_date?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_member_type: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["member_type"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_member_or_card_member: { Args: { _user_id: string }; Returns: boolean }
      is_staff_or_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "staff" | "card_member" | "member"
      member_type: "regular" | "card"
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
    Enums: {
      app_role: ["admin", "staff", "card_member", "member"],
      member_type: ["regular", "card"],
    },
  },
} as const
