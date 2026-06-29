/**
 * Zustand Auth Store
 * Manages authentication state and user session
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { User, UserRole, AuthState } from '../types';
import api from '../services/api';

interface AuthStore extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshAccessToken: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  hasRole: (...roles: UserRole[]) => boolean;
  hasPermission: (permission: string) => boolean;
  /** True for ADMIN, or for HEAD_OF_PROGRAMS/PROGRAM_LEAD in the Finance (AF) dept */
  isFinanceManager: () => boolean;
}

// Role-based permissions mapping
const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  ADMIN: [
    // Full system access - all permissions
    'create_request',
    'view_own_requests',
    'view_department_requests',
    'view_all_requests',
    'edit_request',
    'delete_request',
    'submit_request',
    'approve_as_lead',
    'approve_as_hop',
    'approve_as_finance',
    'reject_request',
    'view_budget_lines',
    'manage_budget_lines',
    'top_up_budget',
    'view_reports',
    'export_data',
    'view_users',
    'manage_users',
    // Procurement
    'create_purchase_request',
    'view_purchase_requests',
    'approve_purchase_request',
    'manage_quotations',
    'manage_vendors',
    'committee_review',
    'proc_finance_approve'
  ],
  GENERAL_USER: [
    'create_request',
    'view_own_requests',
    'edit_request',
    'delete_request',
    'submit_request',
    'view_budget_lines',
    'view_reports',
    // Procurement: can create and view own purchase requests
    'create_purchase_request',
    'view_purchase_requests'
  ],
  PROGRAM_LEAD: [
    'create_request',
    'view_own_requests',
    'view_department_requests',
    'view_all_requests',
    'edit_request',
    'delete_request',
    'submit_request',
    'approve_as_lead',
    'reject_request',
    'view_budget_lines',
    'manage_budget_lines',
    'top_up_budget',
    'view_reports',
    'export_data',
    // Procurement: dept-level approval only
    'view_purchase_requests',
    'approve_purchase_request'
  ],
  HEAD_OF_PROGRAMS: [
    'view_own_requests',
    'view_all_requests',
    'approve_as_hop',
    'reject_request',
    'view_budget_lines',
    'manage_budget_lines',
    'top_up_budget',
    'view_reports',
    'export_data',
    // Procurement: dept-level approval only
    'view_purchase_requests',
    'approve_purchase_request'
  ],
  FINANCE_CLERK: [
    'view_all_requests',
    'approve_as_finance',
    'reject_request',
    'view_budget_lines',
    'manage_budget_lines',
    'top_up_budget',
    'view_reports',
    'export_data',
    'view_users',
    // Procurement: finance-level and final approval
    'view_purchase_requests',
    'approve_purchase_request',
    'proc_finance_approve'
  ],
  PROCUREMENT_OFFICER: [
    'view_purchase_requests',
    'manage_quotations',
    'manage_vendors',
    'view_reports',
    'view_budget_lines',
    'export_data'
  ],
  PROCUREMENT_COMMITTEE: [
    'view_purchase_requests',
    'committee_review',
    'view_reports',
    'view_budget_lines'
  ]
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const response = await api.post('/auth/login', { email, password });
          const { user, accessToken, refreshToken } = response.data.data;
          
          set({
            user,
            accessToken,
            refreshToken,
            isAuthenticated: true,
            isLoading: false
          });

          // Set token in API instance
          api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false
        });
        delete api.defaults.headers.common['Authorization'];
      },

      refreshAccessToken: async () => {
        const { refreshToken } = get();
        if (!refreshToken) {
          get().logout();
          return;
        }

        try {
          const response = await api.post('/auth/refresh', { refreshToken });
          const { accessToken } = response.data.data;
          
          set({ accessToken });
          api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
        } catch (error) {
          get().logout();
          throw error;
        }
      },

      setLoading: (loading: boolean) => set({ isLoading: loading }),

      hasRole: (...roles: UserRole[]) => {
        const { user } = get();
        if (!user) return false;
        return roles.includes(user.role);
      },

      hasPermission: (permission: string) => {
        const { user } = get();
        if (!user) return false;
        const permissions = ROLE_PERMISSIONS[user.role] || [];
        return permissions.includes(permission);
      },

      isFinanceManager: () => {
        const { user } = get();
        if (!user) return false;
        if (user.role === 'ADMIN') return true;
        // Only Finance dept (FOS) HOPs/Leads see all data across departments
        return ['HEAD_OF_PROGRAMS', 'PROGRAM_LEAD'].includes(user.role) &&
          user.department_code === 'FOS';
      }
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
);

// Initialize API headers on store rehydration
const initializeAuth = () => {
  const state = useAuthStore.getState();
  if (state.accessToken) {
    api.defaults.headers.common['Authorization'] = `Bearer ${state.accessToken}`;
  }
};

// Call on app initialization
initializeAuth();
