
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '13.0.5'
  }
  public: {
    Tables: {
      broadcasts: {
        Row: {
          company_id: string
          content: string
          created_at: string
          id: string
          sent_by: string | null
        }
        Insert: {
          company_id: string
          content: string
          created_at?: string
          id?: string
          sent_by?: string | null
        }
        Update: {
          company_id?: string
          content?: string
          created_at?: string
          id?: string
          sent_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'broadcasts_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
        ]
      }
      business_profiles: {
        Row: {
          address: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_sort_code: string | null
          created_at: string | null
          email: string | null
          iban: string | null
          id: number
          invoice_counter: number | null
          legal_name: string | null
          logo_url: string | null
          payment_terms: string | null
          phone: string | null
          tax_id: string | null
          user_id: string
          vat_number: string | null
        }
        Insert: {
          address?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_sort_code?: string | null
          created_at?: string | null
          email?: string | null
          iban?: string | null
          id?: never
          invoice_counter?: number | null
          legal_name?: string | null
          logo_url?: string | null
          payment_terms?: string | null
          phone?: string | null
          tax_id?: string | null
          user_id: string
          vat_number?: string | null
        }
        Update: {
          address?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_sort_code?: string | null
          created_at?: string | null
          email?: string | null
          iban?: string | null
          id?: never
          invoice_counter?: number | null
          legal_name?: string | null
          logo_url?: string | null
          payment_terms?: string | null
          phone?: string | null
          tax_id?: string | null
          user_id?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          billing_type: string | null
          created_at: string | null
          custom_line_items: Json | null
          daily_rate: number | null
          email: string | null
          fuel_surcharge_pct: number | null
          hourly_rate: number | null
          id: string
          name: string
          night_out_rate: number | null
          notes: string | null
          payment_terms: string | null
          ppm_empty_rate: number | null
          ppm_loaded_rate: number | null
          user_id: string | null
          waiting_time_free_minutes: number | null
          waiting_time_rate: number | null
        }
        Insert: {
          address?: string | null
          billing_type?: string | null
          created_at?: string | null
          custom_line_items?: Json | null
          daily_rate?: number | null
          email?: string | null
          fuel_surcharge_pct?: number | null
          hourly_rate?: number | null
          id?: string
          name: string
          night_out_rate?: number | null
          notes?: string | null
          payment_terms?: string | null
          ppm_empty_rate?: number | null
          ppm_loaded_rate?: number | null
          user_id?: string | null
          waiting_time_free_minutes?: number | null
          waiting_time_rate?: number | null
        }
        Update: {
          address?: string | null
          billing_type?: string | null
          created_at?: string | null
          custom_line_items?: Json | null
          daily_rate?: number | null
          email?: string | null
          fuel_surcharge_pct?: number | null
          hourly_rate?: number | null
          id?: string
          name?: string
          night_out_rate?: number | null
          notes?: string | null
          payment_terms?: string | null
          ppm_empty_rate?: number | null
          ppm_loaded_rate?: number | null
          user_id?: string | null
          waiting_time_free_minutes?: number | null
          waiting_time_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'clients_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      companies: {
        Row: {
          auth_code: string | null
          auth_code_expires_at: string | null
          created_at: string | null
          created_by: string | null
          default_fuel_cost_per_litre: number | null
          id: string
          max_drivers: number | null
          name: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_period_end: string | null
          subscription_status: string | null
          subscription_tier: string | null
        }
        Insert: {
          auth_code?: string | null
          auth_code_expires_at?: string | null
          created_at?: string | null
          created_by?: string | null
          default_fuel_cost_per_litre?: number | null
          id?: string
          max_drivers?: number | null
          name: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_period_end?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
        }
        Update: {
          auth_code?: string | null
          auth_code_expires_at?: string | null
          created_at?: string | null
          created_by?: string | null
          default_fuel_cost_per_litre?: number | null
          id?: string
          max_drivers?: number | null
          name?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_period_end?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
        }
        Relationships: []
      }
      defect_photos: {
        Row: {
          id: string
          storage_path: string
          uploaded_at: string | null
          vehicle_check_id: string | null
        }
        Insert: {
          id?: string
          storage_path: string
          uploaded_at?: string | null
          vehicle_check_id?: string | null
        }
        Update: {
          id?: string
          storage_path?: string
          uploaded_at?: string | null
          vehicle_check_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'defect_photos_vehicle_check_id_fkey'
            columns: ['vehicle_check_id']
            isOneToOne: false
            referencedRelation: 'vehicle_checks'
            referencedColumns: ['id']
          },
        ]
      }
      driver_invites: {
        Row: {
          accepted_at: string | null
          accepted_by_user_id: string | null
          company_id: string
          created_at: string
          email: string
          expires_at: string
          full_name: string
          id: string
          invite_code: string
          pay_config_snapshot: Json | null
          status: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          company_id: string
          created_at?: string
          email: string
          expires_at: string
          full_name: string
          id?: string
          invite_code: string
          pay_config_snapshot?: Json | null
          status?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          company_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          full_name?: string
          id?: string
          invite_code?: string
          pay_config_snapshot?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: 'driver_invites_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string | null
          currency: string | null
          date: string
          fuel_litres: number | null
          id: string
          image_url: string | null
          merchant: string | null
          notes: string | null
          raw_ocr_text: string | null
          session_id: string | null
          user_id: string
          vehicle_check_id: string | null
          vehicle_reg: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string | null
          currency?: string | null
          date: string
          fuel_litres?: number | null
          id?: string
          image_url?: string | null
          merchant?: string | null
          notes?: string | null
          raw_ocr_text?: string | null
          session_id?: string | null
          user_id: string
          vehicle_check_id?: string | null
          vehicle_reg?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string | null
          currency?: string | null
          date?: string
          fuel_litres?: number | null
          id?: string
          image_url?: string | null
          merchant?: string | null
          notes?: string | null
          raw_ocr_text?: string | null
          session_id?: string | null
          user_id?: string
          vehicle_check_id?: string | null
          vehicle_reg?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'expenses_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'work_sessions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'expenses_vehicle_check_id_fkey'
            columns: ['vehicle_check_id']
            isOneToOne: false
            referencedRelation: 'vehicle_checks'
            referencedColumns: ['id']
          },
        ]
      }
      invoices: {
        Row: {
          client_address: string | null
          client_email: string | null
          client_name: string
          created_at: string | null
          currency: string
          driver_id: string
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          line_items: Json | null
          notes: string | null
          payment_terms: string | null
          status: string
          subtotal: number
          tax_amount: number | null
          tax_rate: number | null
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          client_address?: string | null
          client_email?: string | null
          client_name: string
          created_at?: string | null
          currency?: string
          driver_id: string
          due_date: string
          id?: string
          invoice_number: string
          issue_date?: string
          line_items?: Json | null
          notes?: string | null
          payment_terms?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number | null
          tax_rate?: number | null
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          client_address?: string | null
          client_email?: string | null
          client_name?: string
          created_at?: string | null
          currency?: string
          driver_id?: string
          due_date?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          line_items?: Json | null
          notes?: string | null
          payment_terms?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number | null
          tax_rate?: number | null
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'invoices_driver_id_fkey'
            columns: ['driver_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      message_reads: {
        Row: {
          id: string
          message_id: string | null
          read_at: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          message_id?: string | null
          read_at?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          message_id?: string | null
          read_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          company_id: string
          created_at: string | null
          id: string
          read_at: string | null
          recipient_id: string | null
          sender_id: string | null
        }
        Insert: {
          body: string
          company_id: string
          created_at?: string | null
          id?: string
          read_at?: string | null
          recipient_id?: string | null
          sender_id?: string | null
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string | null
          id?: string
          read_at?: string | null
          recipient_id?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'messages_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
        ]
      }
      pay_configurations: {
        Row: {
          additional_overtime_tiers: Json | null
          allowance_tiers: Json | null
          created_at: string | null
          hourly_rate: number
          id: string
          overtime_rate_multiplier: number | null
          overtime_rate_percentage: number | null
          overtime_threshold_hours: number | null
          overtime_threshold_unit: string | null
          unpaid_break_minutes: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          additional_overtime_tiers?: Json | null
          allowance_tiers?: Json | null
          created_at?: string | null
          hourly_rate?: number
          id?: string
          overtime_rate_multiplier?: number | null
          overtime_rate_percentage?: number | null
          overtime_threshold_hours?: number | null
          overtime_threshold_unit?: string | null
          unpaid_break_minutes?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          additional_overtime_tiers?: Json | null
          allowance_tiers?: Json | null
          created_at?: string | null
          hourly_rate?: number
          id?: string
          overtime_rate_multiplier?: number | null
          overtime_rate_percentage?: number | null
          overtime_threshold_hours?: number | null
          overtime_threshold_unit?: string | null
          unpaid_break_minutes?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_type: string | null
          company_id: string | null
          cpc_dqc_expiry: string | null
          cpc_dqc_number: string | null
          cpc_training_hours_done: number | null
          created_at: string | null
          date_of_birth: string | null
          driver_license_number: string | null
          driving_licence_expiry: string | null
          driving_licence_number: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          first_time_setup_completed_at: string | null
          full_address: string | null
          full_name: string | null
          id: string
          is_active: boolean | null
          last_shift_onboarding_completed_at: string | null
          national_insurance_number: string | null
          payroll_number: string | null
          phone_number: string | null
          role: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_period_end: string | null
          subscription_status: string | null
          tacho_card_expiry: string | null
          tacho_card_number: string | null
          trial_ends_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_type?: string | null
          company_id?: string | null
          cpc_dqc_expiry?: string | null
          cpc_dqc_number?: string | null
          cpc_training_hours_done?: number | null
          created_at?: string | null
          date_of_birth?: string | null
          driver_license_number?: string | null
          driving_licence_expiry?: string | null
          driving_licence_number?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_address?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean | null
          last_shift_onboarding_completed_at?: string | null
          national_insurance_number?: string | null
          payroll_number?: string | null
          phone_number?: string | null
          role?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_period_end?: string | null
          subscription_status?: string | null
          tacho_card_expiry?: string | null
          tacho_card_number?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_type?: string | null
          company_id?: string | null
          cpc_dqc_expiry?: string | null
          cpc_dqc_number?: string | null
          cpc_training_hours_done?: number | null
          created_at?: string | null
          date_of_birth?: string | null
          driver_license_number?: string | null
          driving_licence_expiry?: string | null
          driving_licence_number?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_address?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          last_shift_onboarding_completed_at?: string | null
          national_insurance_number?: string | null
          payroll_number?: string | null
          phone_number?: string | null
          role?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_period_end?: string | null
          subscription_status?: string | null
          tacho_card_expiry?: string | null
          tacho_card_number?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'fk_company'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
        ]
      }
      shift_jobs: {
        Row: {
          client_id: string | null
          collection_point: string | null
          created_at: string | null
          delivery_point: string | null
          drop_count: number | null
          empty_miles: number | null
          id: string
          job_reference: string | null
          loaded_miles: number | null
          logged_at: string | null
          night_out: boolean | null
          notes: string | null
          session_id: string | null
          user_id: string | null
          waiting_minutes: number | null
        }
        Insert: {
          client_id?: string | null
          collection_point?: string | null
          created_at?: string | null
          delivery_point?: string | null
          drop_count?: number | null
          empty_miles?: number | null
          id?: string
          job_reference?: string | null
          loaded_miles?: number | null
          logged_at?: string | null
          night_out?: boolean | null
          notes?: string | null
          session_id?: string | null
          user_id?: string | null
          waiting_minutes?: number | null
        }
        Update: {
          client_id?: string | null
          collection_point?: string | null
          created_at?: string | null
          delivery_point?: string | null
          drop_count?: number | null
          empty_miles?: number | null
          id?: string
          job_reference?: string | null
          loaded_miles?: number | null
          logged_at?: string | null
          night_out?: boolean | null
          notes?: string | null
          session_id?: string | null
          user_id?: string | null
          waiting_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'shift_jobs_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'shift_jobs_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'work_sessions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'shift_jobs_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      shifts: {
        Row: {
          company_id: string
          created_at: string
          date: string
          driver_id: string
          end_time: string
          id: string
          notes: string | null
          start_time: string
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          date: string
          driver_id: string
          end_time: string
          id?: string
          notes?: string | null
          start_time: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          date?: string
          driver_id?: string
          end_time?: string
          id?: string
          notes?: string | null
          start_time?: string
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'shifts_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'shifts_driver_id_fkey'
            columns: ['driver_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'shifts_vehicle_id_fkey'
            columns: ['vehicle_id']
            isOneToOne: false
            referencedRelation: 'vehicles'
            referencedColumns: ['id']
          },
        ]
      }
      system_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          target_audience: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          target_audience?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          target_audience?: string
        }
        Relationships: []
      }
      vehicle_checks: {
        Row: {
          check_status: string | null
          closing_odometer: number | null
          company_id: string | null
          created_at: string | null
          defect_details: string | null
          defect_lifecycle_status: string | null
          driver_id: string | null
          id: string
          inspection_duration_seconds: number | null
          items: Json
          odometer_reading: number | null
          reg_number: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          session_id: string | null
          signature_url: string | null
          trailer_reg: string | null
          vehicle_make: string | null
          vehicle_type: string
        }
        Insert: {
          check_status?: string | null
          closing_odometer?: number | null
          company_id?: string | null
          created_at?: string | null
          defect_details?: string | null
          defect_lifecycle_status?: string | null
          driver_id?: string | null
          id?: string
          inspection_duration_seconds?: number | null
          items: Json
          odometer_reading?: number | null
          reg_number: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string | null
          signature_url?: string | null
          trailer_reg?: string | null
          vehicle_make?: string | null
          vehicle_type: string
        }
        Update: {
          check_status?: string | null
          closing_odometer?: number | null
          company_id?: string | null
          created_at?: string | null
          defect_details?: string | null
          defect_lifecycle_status?: string | null
          driver_id?: string | null
          id?: string
          inspection_duration_seconds?: number | null
          items?: Json
          odometer_reading?: number | null
          reg_number?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string | null
          signature_url?: string | null
          trailer_reg?: string | null
          vehicle_make?: string | null
          vehicle_type?: string
        }
        Relationships: [
          {
            foreignKeyName: 'vehicle_checks_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'vehicle_checks_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'work_sessions'
            referencedColumns: ['id']
          },
        ]
      }
      vehicles: {
        Row: {
          company_id: string | null
          created_at: string | null
          current_odometer: number | null
          id: string
          insurance_expiry: string | null
          is_vor: boolean | null
          loler_due_date: string | null
          maintenance_called: boolean | null
          make: string
          model: string | null
          mot_due_date: string | null
          pmi_due_date: string | null
          pmi_interval_weeks: number | null
          reg_number: string
          status_notes: string | null
          tacho_calibration_due: string | null
          updated_at: string | null
          user_id: string | null
          vehicle_type: string
          vin_number: string | null
          year: number | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          current_odometer?: number | null
          id?: string
          insurance_expiry?: string | null
          is_vor?: boolean | null
          loler_due_date?: string | null
          maintenance_called?: boolean | null
          make: string
          model?: string | null
          mot_due_date?: string | null
          pmi_due_date?: string | null
          pmi_interval_weeks?: number | null
          reg_number: string
          status_notes?: string | null
          tacho_calibration_due?: string | null
          updated_at?: string | null
          user_id?: string | null
          vehicle_type: string
          vin_number?: string | null
          year?: number | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          current_odometer?: number | null
          id?: string
          insurance_expiry?: string | null
          is_vor?: boolean | null
          loler_due_date?: string | null
          maintenance_called?: boolean | null
          make?: string
          model?: string | null
          mot_due_date?: string | null
          pmi_due_date?: string | null
          pmi_interval_weeks?: number | null
          reg_number?: string
          status_notes?: string | null
          tacho_calibration_due?: string | null
          updated_at?: string | null
          user_id?: string | null
          vehicle_type?: string
          vin_number?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'vehicles_company_id_fkey'
            columns: ['company_id']
            isOneToOne: false
            referencedRelation: 'companies'
            referencedColumns: ['id']
          },
        ]
      }
      work_sessions: {
        Row: {
          client_id: string | null
          compliance_score: number | null
          compliance_violations: string[] | null
          created_at: string | null
          current_break_start: string | null
          current_poa_start: string | null
          date: string
          drop_count: number | null
          empty_miles: number | null
          end_lat: number | null
          end_lng: number | null
          end_time: string | null
          id: string
          is_manual_entry: boolean | null
          job_reference: string | null
          loaded_miles: number | null
          notes: string | null
          other_data: Json | null
          start_lat: number | null
          start_lng: number | null
          start_time: string
          status: string
          timezone: string
          total_break_minutes: number | null
          total_poa_minutes: number | null
          total_work_minutes: number | null
          updated_at: string | null
          user_id: string
          waiting_minutes: number | null
        }
        Insert: {
          client_id?: string | null
          compliance_score?: number | null
          compliance_violations?: string[] | null
          created_at?: string | null
          current_break_start?: string | null
          current_poa_start?: string | null
          date: string
          drop_count?: number | null
          empty_miles?: number | null
          end_lat?: number | null
          end_lng?: number | null
          end_time?: string | null
          id?: string
          is_manual_entry?: boolean | null
          job_reference?: string | null
          loaded_miles?: number | null
          notes?: string | null
          other_data?: Json | null
          start_lat?: number | null
          start_lng?: number | null
          start_time: string
          status?: string
          timezone?: string
          total_break_minutes?: number | null
          total_poa_minutes?: number | null
          total_work_minutes?: number | null
          updated_at?: string | null
          user_id: string
          waiting_minutes?: number | null
        }
        Update: {
          client_id?: string | null
          compliance_score?: number | null
          compliance_violations?: string[] | null
          created_at?: string | null
          current_break_start?: string | null
          current_poa_start?: string | null
          date?: string
          drop_count?: number | null
          empty_miles?: number | null
          end_lat?: number | null
          end_lng?: number | null
          end_time?: string | null
          id?: string
          is_manual_entry?: boolean | null
          job_reference?: string | null
          loaded_miles?: number | null
          notes?: string | null
          other_data?: Json | null
          start_lat?: number | null
          start_lng?: number | null
          start_time?: string
          status?: string
          timezone?: string
          total_break_minutes?: number | null
          total_poa_minutes?: number | null
          total_work_minutes?: number | null
          updated_at?: string | null
          user_id?: string
          waiting_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'work_sessions_client_id_fkey'
            columns: ['client_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'work_sessions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_auth_code: { Args: Record<PropertyKey, never>; Returns: string }
      generate_invoice_number: { Args: Record<PropertyKey, never>; Returns: string }
      validate_auth_code: { Args: { code: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof DatabaseWithoutInternals, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never
