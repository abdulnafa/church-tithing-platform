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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      annual_statements: {
        Row: {
          church_id: string
          created_at: string
          currency: string
          document_path: string | null
          donor_id: string
          generated_at: string | null
          id: string
          period_end: string
          period_start: string
          published_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          statement_number: string
          status: Database["public"]["Enums"]["statement_status"]
          supersedes_statement_id: string | null
          tax_year: number
          total_amount_minor: number
          updated_at: string
          version: number
        }
        Insert: {
          church_id: string
          created_at?: string
          currency: string
          document_path?: string | null
          donor_id: string
          generated_at?: string | null
          id?: string
          period_end: string
          period_start: string
          published_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          statement_number: string
          status?: Database["public"]["Enums"]["statement_status"]
          supersedes_statement_id?: string | null
          tax_year: number
          total_amount_minor?: number
          updated_at?: string
          version?: number
        }
        Update: {
          church_id?: string
          created_at?: string
          currency?: string
          document_path?: string | null
          donor_id?: string
          generated_at?: string | null
          id?: string
          period_end?: string
          period_start?: string
          published_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          statement_number?: string
          status?: Database["public"]["Enums"]["statement_status"]
          supersedes_statement_id?: string | null
          tax_year?: number
          total_amount_minor?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "annual_statements_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "annual_statements_donor_tenant_fk"
            columns: ["church_id", "donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["church_id", "id"]
          },
          {
            foreignKeyName: "annual_statements_supersedes_donor_tenant_fk"
            columns: ["church_id", "supersedes_statement_id", "donor_id"]
            isOneToOne: false
            referencedRelation: "annual_statements"
            referencedColumns: ["church_id", "id", "donor_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          action_code: Database["public"]["Enums"]["audit_action"]
          actor_display_name_snapshot: string
          actor_role_snapshot: string | null
          actor_type: Database["public"]["Enums"]["audit_actor_type"]
          actor_user_id: string | null
          church_id: string | null
          created_at: string
          entity_code: Database["public"]["Enums"]["audit_entity"] | null
          entity_id: string | null
          entity_table: string
          id: number
          ip_hash: string | null
          request_id: string | null
          sanitized_changes: Json
        }
        Insert: {
          action: string
          action_code?: Database["public"]["Enums"]["audit_action"]
          actor_display_name_snapshot: string
          actor_role_snapshot?: string | null
          actor_type?: Database["public"]["Enums"]["audit_actor_type"]
          actor_user_id?: string | null
          church_id?: string | null
          created_at?: string
          entity_code?: Database["public"]["Enums"]["audit_entity"] | null
          entity_id?: string | null
          entity_table: string
          id?: number
          ip_hash?: string | null
          request_id?: string | null
          sanitized_changes?: Json
        }
        Update: {
          action?: string
          action_code?: Database["public"]["Enums"]["audit_action"]
          actor_display_name_snapshot?: string
          actor_role_snapshot?: string | null
          actor_type?: Database["public"]["Enums"]["audit_actor_type"]
          actor_user_id?: string | null
          church_id?: string | null
          created_at?: string
          entity_code?: Database["public"]["Enums"]["audit_entity"] | null
          entity_id?: string | null
          entity_table?: string
          id?: number
          ip_hash?: string | null
          request_id?: string | null
          sanitized_changes?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          church_id: string
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          ends_at: string | null
          fund_id: string
          goal_amount_minor: number | null
          id: string
          image_url: string | null
          name: string
          slug: string
          starts_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
        }
        Insert: {
          church_id: string
          created_at?: string
          created_by?: string | null
          currency: string
          description?: string | null
          ends_at?: string | null
          fund_id: string
          goal_amount_minor?: number | null
          id?: string
          image_url?: string | null
          name: string
          slug: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          ends_at?: string | null
          fund_id?: string
          goal_amount_minor?: number | null
          id?: string
          image_url?: string | null
          name?: string
          slug?: string
          starts_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_fund_tenant_fk"
            columns: ["church_id", "fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["church_id", "id"]
          },
        ]
      }
      church_campaign_mutation_requests: {
        Row: {
          audit_log_id: number
          church_id: string
          created_at: string
          operation: string
          payload_sha256: string
          request_id: string
          requested_by_user_id: string
          result_campaign_id: string
          result_campaigns_revision: number
          result_currency: string
          result_description: string | null
          result_ends_at: string | null
          result_fund_id: string
          result_goal_amount_minor: number | null
          result_name: string
          result_slug: string
          result_starts_at: string | null
          result_status: Database["public"]["Enums"]["campaign_status"]
        }
        Insert: {
          audit_log_id: number
          church_id: string
          created_at?: string
          operation: string
          payload_sha256: string
          request_id: string
          requested_by_user_id: string
          result_campaign_id: string
          result_campaigns_revision: number
          result_currency: string
          result_description?: string | null
          result_ends_at?: string | null
          result_fund_id: string
          result_goal_amount_minor?: number | null
          result_name: string
          result_slug: string
          result_starts_at?: string | null
          result_status: Database["public"]["Enums"]["campaign_status"]
        }
        Update: {
          audit_log_id?: number
          church_id?: string
          created_at?: string
          operation?: string
          payload_sha256?: string
          request_id?: string
          requested_by_user_id?: string
          result_campaign_id?: string
          result_campaigns_revision?: number
          result_currency?: string
          result_description?: string | null
          result_ends_at?: string | null
          result_fund_id?: string
          result_goal_amount_minor?: number | null
          result_name?: string
          result_slug?: string
          result_starts_at?: string | null
          result_status?: Database["public"]["Enums"]["campaign_status"]
        }
        Relationships: [
          {
            foreignKeyName: "church_campaign_mutation_requests_audit_fkey"
            columns: ["audit_log_id"]
            isOneToOne: true
            referencedRelation: "audit_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_campaign_mutation_requests_campaign_fkey"
            columns: ["church_id", "result_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["church_id", "id"]
          },
          {
            foreignKeyName: "church_campaign_mutation_requests_church_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_campaign_mutation_requests_fund_fkey"
            columns: ["church_id", "result_fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["church_id", "id"]
          },
        ]
      }
      church_fund_mutation_requests: {
        Row: {
          audit_log_id: number
          church_id: string
          created_at: string
          operation: string
          payload_sha256: string
          request_id: string
          requested_by_user_id: string
          result_description: string | null
          result_fund_id: string
          result_funds_revision: number
          result_is_default: boolean
          result_name: string
          result_slug: string
          result_sort_order: number
          result_status: Database["public"]["Enums"]["fund_status"]
        }
        Insert: {
          audit_log_id: number
          church_id: string
          created_at?: string
          operation: string
          payload_sha256: string
          request_id: string
          requested_by_user_id: string
          result_description?: string | null
          result_fund_id: string
          result_funds_revision: number
          result_is_default: boolean
          result_name: string
          result_slug: string
          result_sort_order: number
          result_status: Database["public"]["Enums"]["fund_status"]
        }
        Update: {
          audit_log_id?: number
          church_id?: string
          created_at?: string
          operation?: string
          payload_sha256?: string
          request_id?: string
          requested_by_user_id?: string
          result_description?: string | null
          result_fund_id?: string
          result_funds_revision?: number
          result_is_default?: boolean
          result_name?: string
          result_slug?: string
          result_sort_order?: number
          result_status?: Database["public"]["Enums"]["fund_status"]
        }
        Relationships: [
          {
            foreignKeyName: "church_fund_mutation_requests_audit_fkey"
            columns: ["audit_log_id"]
            isOneToOne: true
            referencedRelation: "audit_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_fund_mutation_requests_church_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_fund_mutation_requests_fund_fkey"
            columns: ["church_id", "result_fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["church_id", "id"]
          },
        ]
      }
      church_memberships: {
        Row: {
          accepted_at: string | null
          church_id: string
          created_at: string
          id: string
          invited_at: string
          invited_by: string | null
          invited_email: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["church_member_role"]
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          church_id: string
          created_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          invited_email: string
          revoked_at?: string | null
          role: Database["public"]["Enums"]["church_member_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          church_id?: string
          created_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          invited_email?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["church_member_role"]
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "church_memberships_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      church_provisioning_requests: {
        Row: {
          audit_log_id: number
          church_id: string
          church_slug: string
          created_at: string
          default_fund_id: string
          owner_membership_id: string
          owner_membership_status: Database["public"]["Enums"]["membership_status"]
          payload_sha256: string
          provisioning_status: string
          qr_link_id: string
          qr_short_code: string
          request_id: string
          requested_by_user_id: string
        }
        Insert: {
          audit_log_id: number
          church_id: string
          church_slug: string
          created_at?: string
          default_fund_id: string
          owner_membership_id: string
          owner_membership_status: Database["public"]["Enums"]["membership_status"]
          payload_sha256: string
          provisioning_status?: string
          qr_link_id: string
          qr_short_code: string
          request_id: string
          requested_by_user_id: string
        }
        Update: {
          audit_log_id?: number
          church_id?: string
          church_slug?: string
          created_at?: string
          default_fund_id?: string
          owner_membership_id?: string
          owner_membership_status?: Database["public"]["Enums"]["membership_status"]
          payload_sha256?: string
          provisioning_status?: string
          qr_link_id?: string
          qr_short_code?: string
          request_id?: string
          requested_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "church_provisioning_requests_audit_fkey"
            columns: ["audit_log_id"]
            isOneToOne: true
            referencedRelation: "audit_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_provisioning_requests_church_fkey"
            columns: ["church_id"]
            isOneToOne: true
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_provisioning_requests_fund_fkey"
            columns: ["church_id", "default_fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["church_id", "id"]
          },
          {
            foreignKeyName: "church_provisioning_requests_qr_fkey"
            columns: ["church_id", "qr_link_id"]
            isOneToOne: false
            referencedRelation: "qr_links"
            referencedColumns: ["church_id", "id"]
          },
        ]
      }
      church_settings_update_requests: {
        Row: {
          audit_log_id: number
          church_id: string
          cleanup_completed_at: string | null
          created_at: string
          logo_cleanup_path: string | null
          logo_cleanup_status: string
          payload_sha256: string
          request_id: string
          requested_by_user_id: string
          result_logo_storage_path: string | null
          result_settings_revision: number
        }
        Insert: {
          audit_log_id: number
          church_id: string
          cleanup_completed_at?: string | null
          created_at?: string
          logo_cleanup_path?: string | null
          logo_cleanup_status: string
          payload_sha256: string
          request_id: string
          requested_by_user_id: string
          result_logo_storage_path?: string | null
          result_settings_revision: number
        }
        Update: {
          audit_log_id?: number
          church_id?: string
          cleanup_completed_at?: string | null
          created_at?: string
          logo_cleanup_path?: string | null
          logo_cleanup_status?: string
          payload_sha256?: string
          request_id?: string
          requested_by_user_id?: string
          result_logo_storage_path?: string | null
          result_settings_revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "church_settings_update_requests_audit_fkey"
            columns: ["audit_log_id"]
            isOneToOne: true
            referencedRelation: "audit_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_settings_update_requests_church_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      church_staff_mutation_requests: {
        Row: {
          audit_log_id: number
          church_id: string
          created_at: string
          operation: string
          payload_sha256: string
          request_id: string
          requested_by_user_id: string
          result_membership_id: string
          result_role: Database["public"]["Enums"]["church_member_role"]
          result_staff_revision: number
          result_status: Database["public"]["Enums"]["membership_status"]
          result_user_id_snapshot: string | null
        }
        Insert: {
          audit_log_id: number
          church_id: string
          created_at?: string
          operation: string
          payload_sha256: string
          request_id: string
          requested_by_user_id: string
          result_membership_id: string
          result_role: Database["public"]["Enums"]["church_member_role"]
          result_staff_revision: number
          result_status: Database["public"]["Enums"]["membership_status"]
          result_user_id_snapshot?: string | null
        }
        Update: {
          audit_log_id?: number
          church_id?: string
          created_at?: string
          operation?: string
          payload_sha256?: string
          request_id?: string
          requested_by_user_id?: string
          result_membership_id?: string
          result_role?: Database["public"]["Enums"]["church_member_role"]
          result_staff_revision?: number
          result_status?: Database["public"]["Enums"]["membership_status"]
          result_user_id_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "church_staff_mutation_requests_audit_fkey"
            columns: ["audit_log_id"]
            isOneToOne: true
            referencedRelation: "audit_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_staff_mutation_requests_church_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "church_staff_mutation_requests_membership_fkey"
            columns: ["church_id", "result_membership_id"]
            isOneToOne: false
            referencedRelation: "church_memberships"
            referencedColumns: ["church_id", "id"]
          },
        ]
      }
      churches: {
        Row: {
          activated_at: string | null
          campaigns_revision: number
          created_at: string
          created_by: string | null
          default_currency: string
          funds_revision: number
          id: string
          legal_name: string | null
          lifecycle_revision: number
          logo_storage_path: string | null
          logo_url: string | null
          name: string
          primary_color: string | null
          public_settings: Json
          secondary_color: string | null
          settings_revision: number
          slug: string
          staff_revision: number
          status: Database["public"]["Enums"]["church_status"]
          support_email: string | null
          suspended_at: string | null
          thank_you_message: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          campaigns_revision?: number
          created_at?: string
          created_by?: string | null
          default_currency?: string
          funds_revision?: number
          id?: string
          legal_name?: string | null
          lifecycle_revision?: number
          logo_storage_path?: string | null
          logo_url?: string | null
          name: string
          primary_color?: string | null
          public_settings?: Json
          secondary_color?: string | null
          settings_revision?: number
          slug: string
          staff_revision?: number
          status?: Database["public"]["Enums"]["church_status"]
          support_email?: string | null
          suspended_at?: string | null
          thank_you_message?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          campaigns_revision?: number
          created_at?: string
          created_by?: string | null
          default_currency?: string
          funds_revision?: number
          id?: string
          legal_name?: string | null
          lifecycle_revision?: number
          logo_storage_path?: string | null
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          public_settings?: Json
          secondary_color?: string | null
          settings_revision?: number
          slug?: string
          staff_revision?: number
          status?: Database["public"]["Enums"]["church_status"]
          support_email?: string | null
          suspended_at?: string | null
          thank_you_message?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      donations: {
        Row: {
          amount_minor: number
          campaign_id: string | null
          church_id: string
          created_at: string
          created_by: string | null
          currency: string
          donated_at: string | null
          donor_display_name: string | null
          donor_email: string | null
          donor_id: string | null
          donor_message: string | null
          external_idempotency_key: string | null
          failed_at: string | null
          failure_code: string | null
          failure_message: string | null
          fund_id: string
          id: string
          net_amount_minor: number | null
          payment_connection_id: string | null
          payment_method_brand: string | null
          payment_method_last4: string | null
          processing_fee_minor: number
          provider_charge_reference: string | null
          provider_payment_reference: string | null
          recurring_gift_id: string | null
          refunded_amount_minor: number
          refunded_at: string | null
          settled_at: string | null
          source: Database["public"]["Enums"]["donation_source"]
          status: Database["public"]["Enums"]["donation_status"]
          updated_at: string
        }
        Insert: {
          amount_minor: number
          campaign_id?: string | null
          church_id: string
          created_at?: string
          created_by?: string | null
          currency: string
          donated_at?: string | null
          donor_display_name?: string | null
          donor_email?: string | null
          donor_id?: string | null
          donor_message?: string | null
          external_idempotency_key?: string | null
          failed_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          fund_id: string
          id?: string
          net_amount_minor?: number | null
          payment_connection_id?: string | null
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          processing_fee_minor?: number
          provider_charge_reference?: string | null
          provider_payment_reference?: string | null
          recurring_gift_id?: string | null
          refunded_amount_minor?: number
          refunded_at?: string | null
          settled_at?: string | null
          source?: Database["public"]["Enums"]["donation_source"]
          status?: Database["public"]["Enums"]["donation_status"]
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          campaign_id?: string | null
          church_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          donated_at?: string | null
          donor_display_name?: string | null
          donor_email?: string | null
          donor_id?: string | null
          donor_message?: string | null
          external_idempotency_key?: string | null
          failed_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          fund_id?: string
          id?: string
          net_amount_minor?: number | null
          payment_connection_id?: string | null
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          processing_fee_minor?: number
          provider_charge_reference?: string | null
          provider_payment_reference?: string | null
          recurring_gift_id?: string | null
          refunded_amount_minor?: number
          refunded_at?: string | null
          settled_at?: string | null
          source?: Database["public"]["Enums"]["donation_source"]
          status?: Database["public"]["Enums"]["donation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "donations_campaign_tenant_fk"
            columns: ["church_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["church_id", "id"]
          },
          {
            foreignKeyName: "donations_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_connection_tenant_fk"
            columns: ["church_id", "payment_connection_id"]
            isOneToOne: false
            referencedRelation: "payment_provider_connections"
            referencedColumns: ["church_id", "id"]
          },
          {
            foreignKeyName: "donations_donor_tenant_fk"
            columns: ["church_id", "donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["church_id", "id"]
          },
          {
            foreignKeyName: "donations_fund_tenant_fk"
            columns: ["church_id", "fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["church_id", "id"]
          },
          {
            foreignKeyName: "donations_recurring_identity_tenant_fk"
            columns: [
              "church_id",
              "recurring_gift_id",
              "donor_id",
              "payment_connection_id",
            ]
            isOneToOne: false
            referencedRelation: "recurring_gifts"
            referencedColumns: [
              "church_id",
              "id",
              "donor_id",
              "payment_connection_id",
            ]
          },
        ]
      }
      donor_profile_mutation_requests: {
        Row: {
          audit_log_id: number
          church_id: string
          created_at: string
          payload_sha256: string
          request_id: string
          requested_by_user_id: string
          result_donor_id: string
          result_operation: string
          result_profile_revision: number
        }
        Insert: {
          audit_log_id: number
          church_id: string
          created_at?: string
          payload_sha256: string
          request_id: string
          requested_by_user_id: string
          result_donor_id: string
          result_operation: string
          result_profile_revision: number
        }
        Update: {
          audit_log_id?: number
          church_id?: string
          created_at?: string
          payload_sha256?: string
          request_id?: string
          requested_by_user_id?: string
          result_donor_id?: string
          result_operation?: string
          result_profile_revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "donor_profile_mutation_requests_audit_fkey"
            columns: ["audit_log_id"]
            isOneToOne: true
            referencedRelation: "audit_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donor_profile_mutation_requests_church_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donor_profile_mutation_requests_donor_fkey"
            columns: ["church_id", "result_donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["church_id", "id"]
          },
        ]
      }
      donors: {
        Row: {
          auth_user_id: string | null
          church_id: string
          created_at: string
          display_name: string
          email: string
          id: string
          is_anonymous: boolean
          last_gave_at: string | null
          phone: string | null
          profile_revision: number
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          church_id: string
          created_at?: string
          display_name: string
          email: string
          id?: string
          is_anonymous?: boolean
          last_gave_at?: string | null
          phone?: string | null
          profile_revision?: number
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          church_id?: string
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          is_anonymous?: boolean
          last_gave_at?: string | null
          phone?: string | null
          profile_revision?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "donors_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          annual_statement_id: string | null
          attempt_count: number
          church_id: string | null
          created_at: string
          delivered_at: string | null
          donation_id: string | null
          donor_id: string | null
          id: string
          last_error: string | null
          provider: string | null
          provider_message_reference: string | null
          queued_at: string
          receipt_id: string | null
          recipient_email: string
          sent_at: string | null
          status: Database["public"]["Enums"]["email_delivery_status"]
          template_key: string
          updated_at: string
        }
        Insert: {
          annual_statement_id?: string | null
          attempt_count?: number
          church_id?: string | null
          created_at?: string
          delivered_at?: string | null
          donation_id?: string | null
          donor_id?: string | null
          id?: string
          last_error?: string | null
          provider?: string | null
          provider_message_reference?: string | null
          queued_at?: string
          receipt_id?: string | null
          recipient_email: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_delivery_status"]
          template_key: string
          updated_at?: string
        }
        Update: {
          annual_statement_id?: string | null
          attempt_count?: number
          church_id?: string | null
          created_at?: string
          delivered_at?: string | null
          donation_id?: string | null
          donor_id?: string | null
          id?: string
          last_error?: string | null
          provider?: string | null
          provider_message_reference?: string | null
          queued_at?: string
          receipt_id?: string | null
          recipient_email?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_delivery_status"]
          template_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_events_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_donation_donor_match_fk"
            columns: ["church_id", "donation_id", "donor_id"]
            isOneToOne: false
            referencedRelation: "donations"
            referencedColumns: ["church_id", "id", "donor_id"]
          },
          {
            foreignKeyName: "email_events_donation_tenant_fk"
            columns: ["church_id", "donation_id"]
            isOneToOne: false
            referencedRelation: "donations"
            referencedColumns: ["church_id", "id"]
          },
          {
            foreignKeyName: "email_events_donor_tenant_fk"
            columns: ["church_id", "donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["church_id", "id"]
          },
          {
            foreignKeyName: "email_events_receipt_donor_match_fk"
            columns: ["church_id", "receipt_id", "donor_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["church_id", "id", "donor_id"]
          },
          {
            foreignKeyName: "email_events_receipt_tenant_fk"
            columns: ["church_id", "receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["church_id", "id"]
          },
          {
            foreignKeyName: "email_events_statement_donor_match_fk"
            columns: ["church_id", "annual_statement_id", "donor_id"]
            isOneToOne: false
            referencedRelation: "annual_statements"
            referencedColumns: ["church_id", "id", "donor_id"]
          },
          {
            foreignKeyName: "email_events_statement_tenant_fk"
            columns: ["church_id", "annual_statement_id"]
            isOneToOne: false
            referencedRelation: "annual_statements"
            referencedColumns: ["church_id", "id"]
          },
        ]
      }
      funds: {
        Row: {
          church_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean
          name: string
          slug: string
          sort_order: number
          status: Database["public"]["Enums"]["fund_status"]
          updated_at: string
        }
        Insert: {
          church_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          slug: string
          sort_order?: number
          status?: Database["public"]["Enums"]["fund_status"]
          updated_at?: string
        }
        Update: {
          church_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          slug?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["fund_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funds_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_provider_connections: {
        Row: {
          capabilities: Json
          charges_enabled: boolean
          church_id: string
          created_at: string
          created_by: string | null
          external_account_reference: string
          id: string
          is_primary: boolean
          last_synced_at: string | null
          payouts_enabled: boolean
          provider: string
          recurring_enabled: boolean
          status: Database["public"]["Enums"]["provider_connection_status"]
          supported_currencies: string[]
          updated_at: string
        }
        Insert: {
          capabilities?: Json
          charges_enabled?: boolean
          church_id: string
          created_at?: string
          created_by?: string | null
          external_account_reference: string
          id?: string
          is_primary?: boolean
          last_synced_at?: string | null
          payouts_enabled?: boolean
          provider: string
          recurring_enabled?: boolean
          status?: Database["public"]["Enums"]["provider_connection_status"]
          supported_currencies?: string[]
          updated_at?: string
        }
        Update: {
          capabilities?: Json
          charges_enabled?: boolean
          church_id?: string
          created_at?: string
          created_by?: string | null
          external_account_reference?: string
          id?: string
          is_primary?: boolean
          last_synced_at?: string | null
          payouts_enabled?: boolean
          provider?: string
          recurring_enabled?: boolean
          status?: Database["public"]["Enums"]["provider_connection_status"]
          supported_currencies?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_provider_connections_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_provider_references: {
        Row: {
          church_id: string
          connection_id: string | null
          created_at: string
          donation_id: string | null
          donor_id: string | null
          external_reference: string
          id: string
          object_type: Database["public"]["Enums"]["provider_object_type"]
          platform_subscription_id: string | null
          provider: string
          recurring_gift_id: string | null
          sanitized_metadata: Json
          updated_at: string
        }
        Insert: {
          church_id: string
          connection_id?: string | null
          created_at?: string
          donation_id?: string | null
          donor_id?: string | null
          external_reference: string
          id?: string
          object_type: Database["public"]["Enums"]["provider_object_type"]
          platform_subscription_id?: string | null
          provider: string
          recurring_gift_id?: string | null
          sanitized_metadata?: Json
          updated_at?: string
        }
        Update: {
          church_id?: string
          connection_id?: string | null
          created_at?: string
          donation_id?: string | null
          donor_id?: string | null
          external_reference?: string
          id?: string
          object_type?: Database["public"]["Enums"]["provider_object_type"]
          platform_subscription_id?: string | null
          provider?: string
          recurring_gift_id?: string | null
          sanitized_metadata?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_provider_references_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_provider_references_connection_tenant_fk"
            columns: ["church_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "payment_provider_connections"
            referencedColumns: ["church_id", "id"]
          },
          {
            foreignKeyName: "payment_provider_references_donation_tenant_fk"
            columns: ["church_id", "donation_id"]
            isOneToOne: false
            referencedRelation: "donations"
            referencedColumns: ["church_id", "id"]
          },
          {
            foreignKeyName: "payment_provider_references_donor_tenant_fk"
            columns: ["church_id", "donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["church_id", "id"]
          },
          {
            foreignKeyName: "payment_provider_references_platform_subscription_tenant_fk"
            columns: ["church_id", "platform_subscription_id"]
            isOneToOne: false
            referencedRelation: "platform_subscriptions"
            referencedColumns: ["church_id", "id"]
          },
          {
            foreignKeyName: "payment_provider_references_recurring_tenant_fk"
            columns: ["church_id", "recurring_gift_id"]
            isOneToOne: false
            referencedRelation: "recurring_gifts"
            referencedColumns: ["church_id", "id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          created_by: string | null
          is_active: boolean
          role: Database["public"]["Enums"]["platform_admin_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          is_active?: boolean
          role?: Database["public"]["Enums"]["platform_admin_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          is_active?: boolean
          role?: Database["public"]["Enums"]["platform_admin_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_onboarding_default_requests: {
        Row: {
          audit_log_id: number
          created_at: string
          payload_sha256: string
          request_id: string
          requested_by_user_id: string
          result_default_currency: string
          result_default_primary_color: string
          result_default_secondary_color: string
          result_default_timezone: string
          result_settings_revision: number
          result_updated_at: string
        }
        Insert: {
          audit_log_id: number
          created_at?: string
          payload_sha256: string
          request_id: string
          requested_by_user_id: string
          result_default_currency: string
          result_default_primary_color: string
          result_default_secondary_color: string
          result_default_timezone: string
          result_settings_revision: number
          result_updated_at: string
        }
        Update: {
          audit_log_id?: number
          created_at?: string
          payload_sha256?: string
          request_id?: string
          requested_by_user_id?: string
          result_default_currency?: string
          result_default_primary_color?: string
          result_default_secondary_color?: string
          result_default_timezone?: string
          result_settings_revision?: number
          result_updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_onboarding_default_requests_audit_fkey"
            columns: ["audit_log_id"]
            isOneToOne: true
            referencedRelation: "audit_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_onboarding_defaults: {
        Row: {
          default_currency: string
          default_primary_color: string
          default_secondary_color: string
          default_timezone: string
          settings_revision: number
          singleton_key: boolean
          updated_at: string
        }
        Insert: {
          default_currency?: string
          default_primary_color?: string
          default_secondary_color?: string
          default_timezone?: string
          settings_revision?: number
          singleton_key?: boolean
          updated_at?: string
        }
        Update: {
          default_currency?: string
          default_primary_color?: string
          default_secondary_color?: string
          default_timezone?: string
          settings_revision?: number
          singleton_key?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      platform_subscriptions: {
        Row: {
          amount_minor: number
          cancel_at_period_end: boolean
          canceled_at: string | null
          church_id: string
          created_at: string
          currency: string
          current_period_end: string | null
          current_period_start: string | null
          grace_period_ends_at: string | null
          id: string
          plan_code: string
          provider: string
          provider_customer_reference: string | null
          provider_subscription_reference: string | null
          status: Database["public"]["Enums"]["platform_subscription_status"]
          updated_at: string
        }
        Insert: {
          amount_minor: number
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          church_id: string
          created_at?: string
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          grace_period_ends_at?: string | null
          id?: string
          plan_code: string
          provider?: string
          provider_customer_reference?: string | null
          provider_subscription_reference?: string | null
          status?: Database["public"]["Enums"]["platform_subscription_status"]
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          church_id?: string
          created_at?: string
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          grace_period_ends_at?: string | null
          id?: string
          plan_code?: string
          provider?: string
          provider_customer_reference?: string | null
          provider_subscription_reference?: string | null
          status?: Database["public"]["Enums"]["platform_subscription_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_subscriptions_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: true
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_tenant_lifecycle_requests: {
        Row: {
          audit_log_id: number
          church_id: string
          created_at: string
          operation: string
          payload_sha256: string
          request_id: string
          requested_by_user_id: string
          result_activated_at: string
          result_lifecycle_revision: number
          result_status: Database["public"]["Enums"]["church_status"]
          result_suspended_at: string | null
          suspension_reason_code: string | null
        }
        Insert: {
          audit_log_id: number
          church_id: string
          created_at?: string
          operation: string
          payload_sha256: string
          request_id: string
          requested_by_user_id: string
          result_activated_at: string
          result_lifecycle_revision: number
          result_status: Database["public"]["Enums"]["church_status"]
          result_suspended_at?: string | null
          suspension_reason_code?: string | null
        }
        Update: {
          audit_log_id?: number
          church_id?: string
          created_at?: string
          operation?: string
          payload_sha256?: string
          request_id?: string
          requested_by_user_id?: string
          result_activated_at?: string
          result_lifecycle_revision?: number
          result_status?: Database["public"]["Enums"]["church_status"]
          result_suspended_at?: string | null
          suspension_reason_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_tenant_lifecycle_requests_audit_fkey"
            columns: ["audit_log_id"]
            isOneToOne: true
            referencedRelation: "audit_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_tenant_lifecycle_requests_church_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
        ]
      }
      prayer_request_consent_versions: {
        Row: {
          approved_at: string
          created_at: string
          version_id: string
          wording_sha256: string
        }
        Insert: {
          approved_at: string
          created_at?: string
          version_id: string
          wording_sha256: string
        }
        Update: {
          approved_at?: string
          created_at?: string
          version_id?: string
          wording_sha256?: string
        }
        Relationships: []
      }
      prayer_request_review_requests: {
        Row: {
          audit_log_id: number
          church_id: string
          created_at: string
          payload_sha256: string
          prayer_request_id: string
          request_id: string
          requested_by_user_id: string
          result_reviewed_at: string
          result_revision: number
        }
        Insert: {
          audit_log_id: number
          church_id: string
          created_at?: string
          payload_sha256: string
          prayer_request_id: string
          request_id: string
          requested_by_user_id: string
          result_reviewed_at: string
          result_revision: number
        }
        Update: {
          audit_log_id?: number
          church_id?: string
          created_at?: string
          payload_sha256?: string
          prayer_request_id?: string
          request_id?: string
          requested_by_user_id?: string
          result_reviewed_at?: string
          result_revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "prayer_request_review_requests_audit_fkey"
            columns: ["audit_log_id"]
            isOneToOne: true
            referencedRelation: "audit_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prayer_request_review_requests_church_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prayer_request_review_requests_prayer_fkey"
            columns: ["church_id", "prayer_request_id"]
            isOneToOne: true
            referencedRelation: "prayer_requests"
            referencedColumns: ["church_id", "id"]
          },
        ]
      }
      prayer_requests: {
        Row: {
          body: string
          church_id: string
          consent_version_id: string
          consented_at: string
          created_at: string
          deleted_at: string | null
          donation_id: string | null
          donor_id: string | null
          id: string
          retention_policy_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          revision: number
          updated_at: string
        }
        Insert: {
          body: string
          church_id: string
          consent_version_id: string
          consented_at: string
          created_at?: string
          deleted_at?: string | null
          donation_id?: string | null
          donor_id?: string | null
          id?: string
          retention_policy_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision?: number
          updated_at?: string
        }
        Update: {
          body?: string
          church_id?: string
          consent_version_id?: string
          consented_at?: string
          created_at?: string
          deleted_at?: string | null
          donation_id?: string | null
          donor_id?: string | null
          id?: string
          retention_policy_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prayer_requests_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prayer_requests_consent_version_fkey"
            columns: ["consent_version_id"]
            isOneToOne: false
            referencedRelation: "prayer_request_consent_versions"
            referencedColumns: ["version_id"]
          },
          {
            foreignKeyName: "prayer_requests_donation_donor_match_fk"
            columns: ["church_id", "donation_id", "donor_id"]
            isOneToOne: false
            referencedRelation: "donations"
            referencedColumns: ["church_id", "id", "donor_id"]
          },
          {
            foreignKeyName: "prayer_requests_donation_tenant_fk"
            columns: ["church_id", "donation_id"]
            isOneToOne: false
            referencedRelation: "donations"
            referencedColumns: ["church_id", "id"]
          },
          {
            foreignKeyName: "prayer_requests_donor_tenant_fk"
            columns: ["church_id", "donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["church_id", "id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_active: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      qr_links: {
        Row: {
          campaign_id: string | null
          church_id: string
          created_at: string
          created_by: string | null
          fund_id: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["qr_link_kind"]
          last_scanned_at: string | null
          scan_count: number
          short_code: string
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          church_id: string
          created_at?: string
          created_by?: string | null
          fund_id?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["qr_link_kind"]
          last_scanned_at?: string | null
          scan_count?: number
          short_code?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          church_id?: string
          created_at?: string
          created_by?: string | null
          fund_id?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["qr_link_kind"]
          last_scanned_at?: string | null
          scan_count?: number
          short_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_links_campaign_tenant_fk"
            columns: ["church_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["church_id", "id"]
          },
          {
            foreignKeyName: "qr_links_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_links_fund_tenant_fk"
            columns: ["church_id", "fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["church_id", "id"]
          },
        ]
      }
      receipts: {
        Row: {
          amount_minor: number
          church_id: string
          created_at: string
          currency: string
          document_path: string | null
          donation_id: string
          donor_id: string | null
          id: string
          issued_at: string | null
          receipt_number: string
          recipient_email: string | null
          status: Database["public"]["Enums"]["receipt_status"]
          updated_at: string
          version: number
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          amount_minor: number
          church_id: string
          created_at?: string
          currency: string
          document_path?: string | null
          donation_id: string
          donor_id?: string | null
          id?: string
          issued_at?: string | null
          receipt_number: string
          recipient_email?: string | null
          status?: Database["public"]["Enums"]["receipt_status"]
          updated_at?: string
          version?: number
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          amount_minor?: number
          church_id?: string
          created_at?: string
          currency?: string
          document_path?: string | null
          donation_id?: string
          donor_id?: string | null
          id?: string
          issued_at?: string | null
          receipt_number?: string
          recipient_email?: string | null
          status?: Database["public"]["Enums"]["receipt_status"]
          updated_at?: string
          version?: number
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_donation_donor_match_fk"
            columns: ["church_id", "donation_id", "donor_id"]
            isOneToOne: false
            referencedRelation: "donations"
            referencedColumns: ["church_id", "id", "donor_id"]
          },
          {
            foreignKeyName: "receipts_donation_tenant_fk"
            columns: ["church_id", "donation_id"]
            isOneToOne: false
            referencedRelation: "donations"
            referencedColumns: ["church_id", "id"]
          },
          {
            foreignKeyName: "receipts_donor_tenant_fk"
            columns: ["church_id", "donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["church_id", "id"]
          },
        ]
      }
      recurring_gifts: {
        Row: {
          amount_minor: number
          campaign_id: string | null
          cancel_reason: string | null
          canceled_at: string | null
          church_id: string
          created_at: string
          currency: string
          donor_id: string
          frequency: Database["public"]["Enums"]["recurring_frequency"]
          fund_id: string
          id: string
          next_charge_at: string | null
          paused_at: string | null
          payment_connection_id: string
          payment_method_brand: string | null
          payment_method_last4: string | null
          provider_payment_method_reference: string | null
          provider_subscription_reference: string | null
          resume_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["recurring_gift_status"]
          updated_at: string
        }
        Insert: {
          amount_minor: number
          campaign_id?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          church_id: string
          created_at?: string
          currency: string
          donor_id: string
          frequency: Database["public"]["Enums"]["recurring_frequency"]
          fund_id: string
          id?: string
          next_charge_at?: string | null
          paused_at?: string | null
          payment_connection_id: string
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          provider_payment_method_reference?: string | null
          provider_subscription_reference?: string | null
          resume_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["recurring_gift_status"]
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          campaign_id?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          church_id?: string
          created_at?: string
          currency?: string
          donor_id?: string
          frequency?: Database["public"]["Enums"]["recurring_frequency"]
          fund_id?: string
          id?: string
          next_charge_at?: string | null
          paused_at?: string | null
          payment_connection_id?: string
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          provider_payment_method_reference?: string | null
          provider_subscription_reference?: string | null
          resume_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["recurring_gift_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_gifts_campaign_tenant_fk"
            columns: ["church_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["church_id", "id"]
          },
          {
            foreignKeyName: "recurring_gifts_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_gifts_connection_tenant_fk"
            columns: ["church_id", "payment_connection_id"]
            isOneToOne: false
            referencedRelation: "payment_provider_connections"
            referencedColumns: ["church_id", "id"]
          },
          {
            foreignKeyName: "recurring_gifts_donor_tenant_fk"
            columns: ["church_id", "donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["church_id", "id"]
          },
          {
            foreignKeyName: "recurring_gifts_fund_tenant_fk"
            columns: ["church_id", "fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["church_id", "id"]
          },
        ]
      }
      statement_donations: {
        Row: {
          church_id: string
          created_at: string
          donation_id: string
          donor_id: string
          included_amount_minor: number
          statement_id: string
        }
        Insert: {
          church_id: string
          created_at?: string
          donation_id: string
          donor_id: string
          included_amount_minor: number
          statement_id: string
        }
        Update: {
          church_id?: string
          created_at?: string
          donation_id?: string
          donor_id?: string
          included_amount_minor?: number
          statement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "statement_donations_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_donations_donation_donor_match_fk"
            columns: ["church_id", "donation_id", "donor_id"]
            isOneToOne: false
            referencedRelation: "donations"
            referencedColumns: ["church_id", "id", "donor_id"]
          },
          {
            foreignKeyName: "statement_donations_statement_donor_match_fk"
            columns: ["church_id", "statement_id", "donor_id"]
            isOneToOne: false
            referencedRelation: "annual_statements"
            referencedColumns: ["church_id", "id", "donor_id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          attempt_count: number
          church_id: string | null
          connection_id: string | null
          created_at: string
          event_type: string
          external_event_reference: string
          id: string
          last_error: string | null
          next_retry_at: string | null
          payload_sha256: string | null
          processed_at: string | null
          processing_started_at: string | null
          provider: string
          received_at: string
          sanitized_payload: Json
          status: Database["public"]["Enums"]["webhook_processing_status"]
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          church_id?: string | null
          connection_id?: string | null
          created_at?: string
          event_type: string
          external_event_reference: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          payload_sha256?: string | null
          processed_at?: string | null
          processing_started_at?: string | null
          provider: string
          received_at?: string
          sanitized_payload?: Json
          status?: Database["public"]["Enums"]["webhook_processing_status"]
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          church_id?: string | null
          connection_id?: string | null
          created_at?: string
          event_type?: string
          external_event_reference?: string
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          payload_sha256?: string | null
          processed_at?: string | null
          processing_started_at?: string | null
          provider?: string
          received_at?: string
          sanitized_payload?: Json
          status?: Database["public"]["Enums"]["webhook_processing_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_church_id_fkey"
            columns: ["church_id"]
            isOneToOne: false
            referencedRelation: "churches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_connection_tenant_fk"
            columns: ["church_id", "connection_id"]
            isOneToOne: false
            referencedRelation: "payment_provider_connections"
            referencedColumns: ["church_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      append_audit_event: {
        Args: {
          event_action: Database["public"]["Enums"]["audit_action"]
          event_actor_type: Database["public"]["Enums"]["audit_actor_type"]
          event_actor_user_id?: string
          event_entity: Database["public"]["Enums"]["audit_entity"]
          event_entity_id?: string
          event_ip_hash?: string
          event_request_id?: string
          event_sanitized_changes?: Json
          target_church_id: string
        }
        Returns: number
      }
      audit_changes_match_action: {
        Args: {
          candidate: Json
          event_action: Database["public"]["Enums"]["audit_action"]
        }
        Returns: boolean
      }
      audit_scalar_is_safe: { Args: { candidate: string }; Returns: boolean }
      can_delete_church_logo: {
        Args: { candidate_path: string }
        Returns: boolean
      }
      can_read_own_church_membership: {
        Args: { target_church_id: string }
        Returns: boolean
      }
      can_upload_church_logo: {
        Args: { candidate_path: string }
        Returns: boolean
      }
      canonicalize_campaign_description: {
        Args: { input_value: string }
        Returns: string
      }
      canonicalize_campaign_name: {
        Args: { input_value: string }
        Returns: string
      }
      canonicalize_donor_display_name: {
        Args: { input_value: string }
        Returns: string
      }
      canonicalize_donor_email: {
        Args: { input_value: string }
        Returns: string
      }
      canonicalize_fund_description: {
        Args: { input_value: string }
        Returns: string
      }
      canonicalize_fund_name: { Args: { input_value: string }; Returns: string }
      canonicalize_prayer_request_body: {
        Args: { input_value: string }
        Returns: string
      }
      canonicalize_public_display_name: {
        Args: { input_value: string }
        Returns: string
      }
      canonicalize_public_multiline_text: {
        Args: { input_value: string }
        Returns: string
      }
      canonicalize_staff_email: {
        Args: { input_value: string }
        Returns: string
      }
      claim_church_staff_invitation: {
        Args: { target_membership_id: string }
        Returns: Database["public"]["CompositeTypes"]["church_staff_mutation_result"]
        SetofOptions: {
          from: "*"
          to: "church_staff_mutation_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      complete_church_logo_cleanup: {
        Args: {
          logo_cleanup_path: string
          settings_request_id: string
          target_church_id: string
        }
        Returns: boolean
      }
      donor_text_has_unsafe_formatting: {
        Args: { input_value: string }
        Returns: boolean
      }
      get_church_campaign_progress: {
        Args: { target_church_id: string }
        Returns: Database["public"]["CompositeTypes"]["church_campaign_progress_record"][]
        SetofOptions: {
          from: "*"
          to: "church_campaign_progress_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_church_campaigns: {
        Args: { target_church_id: string }
        Returns: Database["public"]["CompositeTypes"]["church_campaign_snapshot"]
        SetofOptions: {
          from: "*"
          to: "church_campaign_snapshot"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_church_funds: {
        Args: { target_church_id: string }
        Returns: Database["public"]["CompositeTypes"]["church_fund_record"][]
        SetofOptions: {
          from: "*"
          to: "church_fund_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_church_qr_snapshot: {
        Args: { target_church_id: string }
        Returns: {
          church_id: string
          church_slug: string
          is_active: boolean
          short_code: string
        }[]
      }
      get_church_settings: {
        Args: { target_church_id: string }
        Returns: Database["public"]["CompositeTypes"]["church_settings_snapshot"]
        SetofOptions: {
          from: "*"
          to: "church_settings_snapshot"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_church_staff: {
        Args: { target_church_id: string }
        Returns: Database["public"]["CompositeTypes"]["church_staff_snapshot"]
        SetofOptions: {
          from: "*"
          to: "church_staff_snapshot"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_my_church_permissions: {
        Args: { target_church_id: string }
        Returns: Database["public"]["Enums"]["church_permission"][]
      }
      get_my_donor_profile: {
        Args: { target_church_id: string }
        Returns: Database["public"]["CompositeTypes"]["my_donor_profile_record"][]
        SetofOptions: {
          from: "*"
          to: "my_donor_profile_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_pending_church_logo_cleanups: {
        Args: { target_church_id: string }
        Returns: {
          logo_storage_path: string
          settings_request_id: string
        }[]
      }
      get_platform_onboarding_defaults: {
        Args: never
        Returns: Database["public"]["CompositeTypes"]["platform_onboarding_defaults_snapshot"]
        SetofOptions: {
          from: "*"
          to: "platform_onboarding_defaults_snapshot"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_platform_tenants: {
        Args: {
          tenant_cursor_church_id?: string
          tenant_cursor_created_at?: string
          tenant_page_size?: number
        }
        Returns: Database["public"]["CompositeTypes"]["platform_tenant_page"]
        SetofOptions: {
          from: "*"
          to: "platform_tenant_page"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_prayer_request_queue: {
        Args: { target_church_id: string }
        Returns: Database["public"]["CompositeTypes"]["prayer_request_queue_record"][]
        SetofOptions: {
          from: "*"
          to: "prayer_request_queue_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_public_church_identities: {
        Args: { church_ids: string[] }
        Returns: Database["public"]["CompositeTypes"]["public_church_identity_record"][]
        SetofOptions: {
          from: "*"
          to: "public_church_identity_record"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_public_giving_page: {
        Args: { church_slug: string }
        Returns: Database["public"]["CompositeTypes"]["public_giving_page_record"]
        SetofOptions: {
          from: "*"
          to: "public_giving_page_record"
          isOneToOne: true
          isSetofReturn: true
        }
      }
      has_church_permission: {
        Args: {
          required_permission: Database["public"]["Enums"]["church_permission"]
          target_church_id: string
        }
        Returns: boolean
      }
      has_church_role: {
        Args: {
          allowed_roles: Database["public"]["Enums"]["church_member_role"][]
          target_church_id: string
        }
        Returns: boolean
      }
      is_active_authenticated_user: { Args: never; Returns: boolean }
      is_church_member: { Args: { target_church_id: string }; Returns: boolean }
      is_platform_super_admin: { Args: never; Returns: boolean }
      is_valid_donor_email: { Args: { input_value: string }; Returns: boolean }
      is_valid_provisioning_email: {
        Args: { candidate: string }
        Returns: boolean
      }
      mutate_church_campaign: {
        Args: {
          campaign_description?: string
          campaign_fund_id?: string
          campaign_goal_amount_minor_text?: string
          campaign_name?: string
          campaign_operation: string
          campaign_request_id: string
          campaign_slug?: string
          expected_campaigns_revision: number
          target_campaign_id?: string
          target_church_id: string
        }
        Returns: Database["public"]["CompositeTypes"]["church_campaign_mutation_result"]
        SetofOptions: {
          from: "*"
          to: "church_campaign_mutation_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mutate_church_fund: {
        Args: {
          expected_funds_revision: number
          fund_description?: string
          fund_name?: string
          fund_operation: string
          fund_request_id: string
          fund_slug?: string
          target_church_id: string
          target_fund_id?: string
        }
        Returns: Database["public"]["CompositeTypes"]["church_fund_mutation_result"]
        SetofOptions: {
          from: "*"
          to: "church_fund_mutation_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mutate_church_staff: {
        Args: {
          expected_staff_revision: number
          staff_email?: string
          staff_operation: string
          staff_request_id: string
          staff_role?: string
          target_church_id: string
          target_membership_id?: string
        }
        Returns: Database["public"]["CompositeTypes"]["church_staff_mutation_result"]
        SetofOptions: {
          from: "*"
          to: "church_staff_mutation_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mutate_my_donor_profile: {
        Args: {
          expected_profile_revision: number
          profile_display_name: string
          profile_request_id: string
          target_church_id: string
        }
        Returns: Database["public"]["CompositeTypes"]["my_donor_profile_mutation_result"]
        SetofOptions: {
          from: "*"
          to: "my_donor_profile_mutation_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mutate_platform_tenant_lifecycle: {
        Args: {
          expected_lifecycle_revision: number
          lifecycle_operation: string
          lifecycle_request_id: string
          suspension_reason_code?: string
          target_church_id: string
        }
        Returns: Database["public"]["CompositeTypes"]["platform_tenant_lifecycle_result"]
        SetofOptions: {
          from: "*"
          to: "platform_tenant_lifecycle_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      owns_donor: { Args: { target_donor_id: string }; Returns: boolean }
      platform_tenant_missing_readiness: {
        Args: { target_church_id: string }
        Returns: string[]
      }
      prayer_request_body_has_unsafe_formatting: {
        Args: { input_value: string }
        Returns: boolean
      }
      provision_church: {
        Args: {
          church_currency?: string
          church_display_name: string
          church_legal_name: string
          church_primary_color?: string
          church_secondary_color?: string
          church_slug: string
          church_support_email: string
          church_thank_you_message?: string
          church_timezone?: string
          owner_email: string
          provisioning_request_id: string
        }
        Returns: Database["public"]["CompositeTypes"]["church_provisioning_result"]
        SetofOptions: {
          from: "*"
          to: "church_provisioning_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_public_qr: {
        Args: { target_short_code: string }
        Returns: {
          church_slug: string
        }[]
      }
      review_prayer_request: {
        Args: {
          expected_revision: number
          review_request_id: string
          target_church_id: string
          target_prayer_request_id: string
        }
        Returns: Database["public"]["CompositeTypes"]["prayer_request_review_result"]
        SetofOptions: {
          from: "*"
          to: "prayer_request_review_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      safe_platform_tenant_display_name: {
        Args: { candidate: string }
        Returns: string
      }
      safe_staff_display_name: {
        Args: { input_value: string }
        Returns: string
      }
      update_church_settings: {
        Args: {
          church_display_name: string
          church_legal_name: string
          church_logo_action: string
          church_logo_storage_path: string
          church_primary_color: string
          church_secondary_color: string
          church_support_email: string
          church_thank_you_message: string
          church_timezone: string
          expected_settings_revision: number
          settings_request_id: string
          target_church_id: string
        }
        Returns: Database["public"]["CompositeTypes"]["church_settings_update_result"]
        SetofOptions: {
          from: "*"
          to: "church_settings_update_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_platform_onboarding_defaults: {
        Args: {
          default_currency: string
          default_primary_color: string
          default_secondary_color: string
          default_timezone: string
          expected_settings_revision: number
          settings_request_id: string
        }
        Returns: Database["public"]["CompositeTypes"]["platform_onboarding_defaults_update_result"]
        SetofOptions: {
          from: "*"
          to: "platform_onboarding_defaults_update_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      audit_action:
        | "legacy_imported"
        | "platform_settings_updated"
        | "church_provisioned"
        | "church_settings_updated"
        | "church_status_changed"
        | "staff_invited"
        | "staff_invitation_accepted"
        | "staff_removed"
        | "staff_role_changed"
        | "fund_created"
        | "fund_updated"
        | "fund_archived"
        | "campaign_created"
        | "campaign_updated"
        | "campaign_archived"
        | "provider_connection_updated"
        | "subscription_updated"
        | "report_exported"
        | "receipt_issued"
        | "prayer_request_reviewed"
        | "webhook_processed"
        | "email_status_updated"
        | "donor_profile_created"
        | "donor_profile_updated"
      audit_actor_type: "user" | "system" | "webhook" | "support"
      audit_entity:
        | "platform_settings"
        | "church"
        | "church_membership"
        | "fund"
        | "campaign"
        | "payment_provider_connection"
        | "platform_subscription"
        | "report"
        | "receipt"
        | "prayer_request"
        | "webhook_event"
        | "email_event"
        | "donor"
      campaign_status: "draft" | "active" | "closed" | "archived"
      church_member_role: "owner" | "finance_admin" | "staff" | "accountant"
      church_permission:
        | "workspace_read"
        | "funds_read"
        | "funds_manage"
        | "campaigns_read"
        | "campaigns_manage"
        | "qr_read"
        | "settings_manage"
        | "staff_manage"
        | "provider_manage"
        | "audit_read"
        | "billing_manage"
        | "financial_read"
        | "members_read"
        | "reports_read"
        | "reports_export"
        | "receipts_read"
        | "statements_read"
        | "provider_status_read"
        | "email_status_read"
        | "prayer_requests_review"
      church_status:
        | "onboarding"
        | "active"
        | "suspended"
        | "canceled"
        | "archived"
      donation_source: "online" | "cash" | "cheque" | "other"
      donation_status:
        | "pending"
        | "processing"
        | "succeeded"
        | "failed"
        | "partially_refunded"
        | "refunded"
        | "disputed"
        | "canceled"
      email_delivery_status:
        | "queued"
        | "sent"
        | "delivered"
        | "failed"
        | "bounced"
        | "suppressed"
      fund_status: "active" | "archived"
      membership_status: "invited" | "active" | "suspended" | "revoked"
      platform_admin_role: "super_admin" | "support"
      platform_subscription_status:
        | "incomplete"
        | "active"
        | "past_due"
        | "unpaid"
        | "paused"
        | "canceled"
      provider_connection_status:
        | "pending"
        | "active"
        | "restricted"
        | "disabled"
      provider_object_type:
        | "customer"
        | "payment_method"
        | "payment"
        | "checkout_session"
        | "subscription"
        | "invoice"
        | "refund"
        | "dispute"
        | "payout"
      qr_link_kind: "church" | "fund" | "campaign"
      receipt_status: "draft" | "issued" | "voided"
      recurring_frequency: "weekly" | "monthly"
      recurring_gift_status:
        | "incomplete"
        | "active"
        | "paused"
        | "past_due"
        | "canceled"
      statement_status: "draft" | "published" | "superseded" | "voided"
      webhook_processing_status:
        | "received"
        | "processing"
        | "processed"
        | "failed"
        | "ignored"
    }
    CompositeTypes: {
      church_campaign_mutation_result: {
        church_id: string | null
        campaign_id: string | null
        fund_id: string | null
        name: string | null
        slug: string | null
        description: string | null
        status: Database["public"]["Enums"]["campaign_status"] | null
        goal_amount_minor_text: string | null
        currency: string | null
        starts_at: string | null
        ends_at: string | null
        campaigns_revision: number | null
        replayed: boolean | null
      }
      church_campaign_progress_record: {
        church_id: string | null
        campaign_id: string | null
        currency: string | null
        raised_amount_minor_text: string | null
        eligible_donation_count_text: string | null
      }
      church_campaign_record: {
        campaign_id: string | null
        fund_id: string | null
        name: string | null
        slug: string | null
        description: string | null
        status: Database["public"]["Enums"]["campaign_status"] | null
        goal_amount_minor_text: string | null
        currency: string | null
        starts_at: string | null
        ends_at: string | null
      }
      church_campaign_snapshot: {
        church_id: string | null
        campaigns_revision: number | null
        campaigns:
          | Database["public"]["CompositeTypes"]["church_campaign_record"][]
          | null
      }
      church_fund_mutation_result: {
        church_id: string | null
        fund_id: string | null
        name: string | null
        slug: string | null
        description: string | null
        status: Database["public"]["Enums"]["fund_status"] | null
        is_default: boolean | null
        sort_order: number | null
        funds_revision: number | null
        replayed: boolean | null
      }
      church_fund_record: {
        church_id: string | null
        fund_id: string | null
        name: string | null
        slug: string | null
        description: string | null
        status: Database["public"]["Enums"]["fund_status"] | null
        is_default: boolean | null
        sort_order: number | null
        funds_revision: number | null
      }
      church_provisioning_result: {
        church_id: string | null
        church_slug: string | null
        owner_membership_id: string | null
        owner_membership_status:
          | Database["public"]["Enums"]["membership_status"]
          | null
        default_fund_id: string | null
        qr_short_code: string | null
        replayed: boolean | null
      }
      church_settings_snapshot: {
        church_id: string | null
        display_name: string | null
        legal_name: string | null
        slug: string | null
        status: Database["public"]["Enums"]["church_status"] | null
        default_currency: string | null
        support_email: string | null
        timezone: string | null
        primary_color: string | null
        secondary_color: string | null
        thank_you_message: string | null
        logo_storage_path: string | null
        settings_revision: number | null
      }
      church_settings_update_result: {
        church_id: string | null
        settings_revision: number | null
        logo_storage_path: string | null
        logo_cleanup_path: string | null
        logo_cleanup_status: string | null
        replayed: boolean | null
      }
      church_staff_mutation_result: {
        church_id: string | null
        membership_id: string | null
        role: Database["public"]["Enums"]["church_member_role"] | null
        status: Database["public"]["Enums"]["membership_status"] | null
        staff_revision: number | null
        replayed: boolean | null
      }
      church_staff_record: {
        membership_id: string | null
        email: string | null
        display_name: string | null
        role: Database["public"]["Enums"]["church_member_role"] | null
        status: Database["public"]["Enums"]["membership_status"] | null
        access_enabled: boolean | null
        is_current_user: boolean | null
        invited_at: string | null
        accepted_at: string | null
        revoked_at: string | null
      }
      church_staff_snapshot: {
        church_id: string | null
        staff_revision: number | null
        staff:
          | Database["public"]["CompositeTypes"]["church_staff_record"][]
          | null
      }
      my_donor_profile_mutation_result: {
        church_id: string | null
        donor_id: string | null
        profile_revision: number | null
        operation: string | null
        replayed: boolean | null
      }
      my_donor_profile_record: {
        church_id: string | null
        donor_id: string | null
        display_name: string | null
        email: string | null
        profile_revision: number | null
        updated_at: string | null
      }
      platform_onboarding_defaults_snapshot: {
        default_currency: string | null
        default_timezone: string | null
        default_primary_color: string | null
        default_secondary_color: string | null
        settings_revision: number | null
        updated_at: string | null
      }
      platform_onboarding_defaults_update_result: {
        default_currency: string | null
        default_timezone: string | null
        default_primary_color: string | null
        default_secondary_color: string | null
        settings_revision: number | null
        updated_at: string | null
        replayed: boolean | null
      }
      platform_tenant_lifecycle_result: {
        church_id: string | null
        status: Database["public"]["Enums"]["church_status"] | null
        lifecycle_revision: number | null
        activated_at: string | null
        suspended_at: string | null
        replayed: boolean | null
      }
      platform_tenant_page: {
        tenants:
          | Database["public"]["CompositeTypes"]["platform_tenant_record"][]
          | null
        total_tenant_count: number | null
        onboarding_count: number | null
        active_count: number | null
        suspended_count: number | null
        next_cursor_created_at: string | null
        next_cursor_church_id: string | null
        has_more: boolean | null
      }
      platform_tenant_record: {
        church_id: string | null
        display_name: string | null
        slug: string | null
        status: Database["public"]["Enums"]["church_status"] | null
        default_currency: string | null
        timezone: string | null
        foundation_ready: boolean | null
        missing_readiness_codes: string[] | null
        lifecycle_revision: number | null
        created_at: string | null
        activated_at: string | null
        suspended_at: string | null
      }
      prayer_request_queue_record: {
        prayer_request_id: string | null
        body: string | null
        is_reviewed: boolean | null
        consented_at: string | null
        created_at: string | null
        reviewed_at: string | null
        updated_at: string | null
        revision: number | null
      }
      prayer_request_review_result: {
        prayer_request_id: string | null
        reviewed_at: string | null
        revision: number | null
        replayed: boolean | null
      }
      public_church_identity_record: {
        church_id: string | null
        display_name: string | null
        church_slug: string | null
      }
      public_giving_campaign_record: {
        campaign_id: string | null
        fund_id: string | null
        name: string | null
        description: string | null
        goal_amount_minor_text: string | null
      }
      public_giving_fund_record: {
        fund_id: string | null
        name: string | null
        description: string | null
        is_default: boolean | null
      }
      public_giving_page_record: {
        church_id: string | null
        church_slug: string | null
        display_name: string | null
        default_currency: string | null
        logo_storage_path: string | null
        primary_color: string | null
        secondary_color: string | null
        thank_you_message: string | null
        funds:
          | Database["public"]["CompositeTypes"]["public_giving_fund_record"][]
          | null
        campaigns:
          | Database["public"]["CompositeTypes"]["public_giving_campaign_record"][]
          | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      audit_action: [
        "legacy_imported",
        "platform_settings_updated",
        "church_provisioned",
        "church_settings_updated",
        "church_status_changed",
        "staff_invited",
        "staff_invitation_accepted",
        "staff_removed",
        "staff_role_changed",
        "fund_created",
        "fund_updated",
        "fund_archived",
        "campaign_created",
        "campaign_updated",
        "campaign_archived",
        "provider_connection_updated",
        "subscription_updated",
        "report_exported",
        "receipt_issued",
        "prayer_request_reviewed",
        "webhook_processed",
        "email_status_updated",
        "donor_profile_created",
        "donor_profile_updated",
      ],
      audit_actor_type: ["user", "system", "webhook", "support"],
      audit_entity: [
        "platform_settings",
        "church",
        "church_membership",
        "fund",
        "campaign",
        "payment_provider_connection",
        "platform_subscription",
        "report",
        "receipt",
        "prayer_request",
        "webhook_event",
        "email_event",
        "donor",
      ],
      campaign_status: ["draft", "active", "closed", "archived"],
      church_member_role: ["owner", "finance_admin", "staff", "accountant"],
      church_permission: [
        "workspace_read",
        "funds_read",
        "funds_manage",
        "campaigns_read",
        "campaigns_manage",
        "qr_read",
        "settings_manage",
        "staff_manage",
        "provider_manage",
        "audit_read",
        "billing_manage",
        "financial_read",
        "members_read",
        "reports_read",
        "reports_export",
        "receipts_read",
        "statements_read",
        "provider_status_read",
        "email_status_read",
        "prayer_requests_review",
      ],
      church_status: [
        "onboarding",
        "active",
        "suspended",
        "canceled",
        "archived",
      ],
      donation_source: ["online", "cash", "cheque", "other"],
      donation_status: [
        "pending",
        "processing",
        "succeeded",
        "failed",
        "partially_refunded",
        "refunded",
        "disputed",
        "canceled",
      ],
      email_delivery_status: [
        "queued",
        "sent",
        "delivered",
        "failed",
        "bounced",
        "suppressed",
      ],
      fund_status: ["active", "archived"],
      membership_status: ["invited", "active", "suspended", "revoked"],
      platform_admin_role: ["super_admin", "support"],
      platform_subscription_status: [
        "incomplete",
        "active",
        "past_due",
        "unpaid",
        "paused",
        "canceled",
      ],
      provider_connection_status: [
        "pending",
        "active",
        "restricted",
        "disabled",
      ],
      provider_object_type: [
        "customer",
        "payment_method",
        "payment",
        "checkout_session",
        "subscription",
        "invoice",
        "refund",
        "dispute",
        "payout",
      ],
      qr_link_kind: ["church", "fund", "campaign"],
      receipt_status: ["draft", "issued", "voided"],
      recurring_frequency: ["weekly", "monthly"],
      recurring_gift_status: [
        "incomplete",
        "active",
        "paused",
        "past_due",
        "canceled",
      ],
      statement_status: ["draft", "published", "superseded", "voided"],
      webhook_processing_status: [
        "received",
        "processing",
        "processed",
        "failed",
        "ignored",
      ],
    },
  },
} as const
