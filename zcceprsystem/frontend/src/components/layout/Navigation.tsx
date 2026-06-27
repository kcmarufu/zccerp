/**
 * Main Navigation Component
 * Professional ERP sidebar with module-based navigation
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  Chip,
  useTheme,
  useMediaQuery,
  Collapse,
  Breadcrumbs,
  Link,
  Tooltip,
  Badge,
  alpha,
  Paper,
  ClickAwayListener,
  Grow,
  Popper,
  CircularProgress
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Description as RequestIcon,
  AddCircle as CreateIcon,
  CheckCircle as ApprovalsIcon,
  AccountBalance as BudgetIcon,
  Assessment as ReportsIcon,
  LocalShipping as DispatchIcon,
  Settings as SettingsIcon,
  Logout as LogoutIcon,
  Person as PersonIcon,
  CardGiftcard as DonorIcon,
  ExpandLess,
  ExpandMore,
  AttachMoney as FinanceIcon,
  Inventory as AssetIcon,
  People as HRIcon,
  BarChart as AnalyticsIcon,
  Receipt as ReconciliationIcon,
  Notifications as NotificationsIcon,
  Search as SearchIcon,
  ChevronRight as ChevronRightIcon,
  Home as HomeIcon,
  Business as OrgIcon,
  FolderOpen as FolderIcon,
  AccountTree as ProjectsIcon,
  ShoppingCart as ProcurementIcon,
  Security as ComplianceIcon,
  TrendingUp as MEIcon,
  VolunteerActivism as GrantsIcon,
  Assignment as AuditIcon,
  Gavel as TenderIcon,
  TrackChanges as IndicatorsIcon,
  Groups as StakeholdersIcon,
  AdminPanelSettings as AdminIcon,
  ManageAccounts as UserMgmtIcon
} from '@mui/icons-material';
import { useAuthStore } from '../../store/authStore';
import { UserRole } from '../../types';
import api from '../../services/api';

const DRAWER_WIDTH = 280;

interface NavSubItem {
  path: string;
  label: string;
  icon?: React.ReactNode;
  roles?: UserRole[];
  permission?: string;
  badge?: number;
}

interface NavSection {
  id: string;
  label: string;
  icon: React.ReactNode;
  roles?: UserRole[];
  permission?: string;
  items: NavSubItem[];
  /** Marks a module as not yet available for production use */
  comingSoon?: boolean;
}

const Navigation: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, hasRole, hasPermission } = useAuthStore();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [expandedSections, setExpandedSections] = useState<string[]>(['finance']);

  // Notification state
  const [notifCount, setNotifCount] = useState(0);
  const [notifItems, setNotifItems] = useState<any[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifAnchorRef = useRef<HTMLButtonElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get('/notifications/count');
      setNotifCount(res.data?.data?.count || 0);
    } catch { /* silent */ }
  }, [user]);

  const fetchNotifItems = async () => {
    setNotifLoading(true);
    try {
      const res = await api.get('/notifications');
      setNotifItems(res.data?.data || []);
    } catch { /* silent */ } finally {
      setNotifLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifCount();
    pollIntervalRef.current = setInterval(fetchNotifCount, 30000);
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
  }, [fetchNotifCount]);

  const handleNotifToggle = () => {
    if (!notifOpen) {
      fetchNotifItems();
    }
    setNotifOpen(prev => !prev);
  };

  const handleMarkAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifItems(prev => prev.map(n => ({ ...n, is_read: true })));
      setNotifCount(0);
    } catch { /* silent */ }
  };

  const handleMarkOneRead = async (notifId: number) => {
    try {
      await api.put(`/notifications/${notifId}/read`);
      setNotifItems(prev => prev.map(n => n.id === notifId ? { ...n, is_read: true } : n));
      setNotifCount(prev => Math.max(0, prev - 1));
    } catch { /* silent */ }
  };

  const handleNotifClose = (event: Event | React.SyntheticEvent) => {
    if (notifAnchorRef.current && notifAnchorRef.current.contains(event.target as HTMLElement)) return;
    setNotifOpen(false);
  };

  const getNotifColor = (type: string) => {
    switch (type) {
      case 'success': return 'success.main';
      case 'error': return 'error.main';
      case 'approval_pending': return 'warning.main';
      case 'reconciliation_pending': return 'info.main';
      default: return 'primary.main';
    }
  };

  // Module-based navigation sections
  const navSections: NavSection[] = [
    {
      id: 'finance',
      label: 'Float Requisition',
      icon: <FinanceIcon />,
      items: [
        {
          path: '/finance/requests',
          label: 'My Requests',
          icon: <RequestIcon />,
          roles: ['GENERAL_USER']
        },
        {
          path: '/finance/requests/create',
          label: 'New Float Request',
          icon: <CreateIcon />,
          roles: ['GENERAL_USER']
        },
        {
          path: '/finance/approvals',
          label: 'Approvals',
          icon: <ApprovalsIcon />,
          roles: ['PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'FINANCE_CLERK', 'ADMIN'] as UserRole[]
        },
        {
          path: '/finance/reconciliation',
          label: 'Reconciliation',
          icon: <ReconciliationIcon />,
        },
        {
          path: '/finance/dispatch',
          label: 'Dispatch Desk',
          icon: <DispatchIcon />,
          roles: ['FINANCE_CLERK', 'ADMIN'] as UserRole[]
        },
        {
          path: '/finance/budgets',
          label: 'Budget Lines',
          icon: <BudgetIcon />,
          permission: 'view_budget_lines'
        },
        {
          path: '/finance/donors',
          label: 'Partner Management',
          icon: <DonorIcon />,
          roles: ['FINANCE_CLERK', 'ADMIN', 'HEAD_OF_PROGRAMS', 'PROGRAM_LEAD'] as UserRole[]
        },
        {
          path: '/finance/projects',
          label: 'Project Management',
          icon: <ProjectsIcon />,
          roles: ['FINANCE_CLERK', 'ADMIN', 'HEAD_OF_PROGRAMS', 'PROGRAM_LEAD'] as UserRole[]
        }
      ]
    },
    {
      id: 'procurement',
      label: 'Procurement',
      icon: <ProcurementIcon />,
      items: [
        {
          path: '/procurement',
          label: 'Procurement Dashboard',
          icon: <ProcurementIcon />
        },
        {
          // General users see only their own requests; approvers/procurement team see all
          path: '/procurement/requests',
          label: 'Purchase Requests',
          icon: <RequestIcon />
        },
        {
          // Only GENERAL_USER creates purchase requests (raises a PR)
          path: '/procurement/requests/create',
          label: 'New Purchase Request',
          icon: <CreateIcon />,
          roles: ['GENERAL_USER', 'ADMIN'] as UserRole[]
        },
        {
          // Approvers: dept approvers, finance, procurement officer, committee
          path: '/procurement/approvals',
          label: 'Approval Queue',
          icon: <ApprovalsIcon />,
          roles: ['PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'FINANCE_CLERK',
                  'PROCUREMENT_OFFICER', 'PROCUREMENT_COMMITTEE', 'ADMIN'] as UserRole[]
        },
        {
          // Vendor management: PROCUREMENT_OFFICER only (not general users, not finance, not leads)
          path: '/procurement/vendors',
          label: 'Vendor Database',
          icon: <StakeholdersIcon />,
          roles: ['PROCUREMENT_OFFICER', 'ADMIN'] as UserRole[]
        }
      ]
    },
    {
      id: 'hr',
      label: 'Human Resources',
      icon: <HRIcon />,
      comingSoon: true,
      items: [
        {
          path: '/hr',
          label: 'HR Dashboard',
          icon: <DashboardIcon />
        },
        {
          path: '/hr/employees',
          label: 'Employee Directory',
          icon: <PersonIcon />
        },
        {
          path: '/hr/leave',
          label: 'Leave Management',
          icon: <FolderIcon />
        },
        {
          path: '/hr/timesheets',
          label: 'Timesheets',
          icon: <FolderIcon />
        },
        {
          path: '/hr/performance',
          label: 'Performance Reviews',
          icon: <AnalyticsIcon />
        },
        {
          path: '/hr/training',
          label: 'Training & Development',
          icon: <FolderIcon />
        },
        {
          path: '/hr/payroll',
          label: 'Payroll',
          icon: <FolderIcon />
        },
        {
          path: '/hr/disciplinary',
          label: 'Disciplinary Records',
          icon: <FolderIcon />
        },
        {
          path: '/hr/exit',
          label: 'Exit Clearance',
          icon: <FolderIcon />
        }
      ]
    },
    {
      id: 'reports',
      label: 'Reports & Analytics',
      icon: <AnalyticsIcon />,
      permission: 'view_reports',
      items: [
        {
          path: '/reports/finance',
          label: 'Financial Reports',
          icon: <ReportsIcon />
        },
        {
          path: '/reports/budgets',
          label: 'Budget Analysis',
          icon: <BudgetIcon />
        }
      ]
    },
    {
      id: 'assets',
      label: 'Asset Management',
      icon: <AssetIcon />,
      comingSoon: true,
      items: [
        {
          path: '/assets',
          label: 'Asset Register',
          icon: <FolderIcon />
        },
        {
          path: '/assets/tracking',
          label: 'Asset Tracking',
          icon: <SearchIcon />
        }
      ]
    },
    {
      id: 'projects',
      label: 'Projects & Programs',
      icon: <ProjectsIcon />,
      comingSoon: true,
      items: [
        {
          path: '/projects',
          label: 'Project Dashboard',
          icon: <ProjectsIcon />
        },
        {
          path: '/projects/milestones',
          label: 'Milestones & Timelines',
          icon: <IndicatorsIcon />
        }
      ]
    },
    {
      id: 'grants',
      label: 'Grants & Partners',
      icon: <GrantsIcon />,
      comingSoon: true,
      items: [
        {
          path: '/grants',
          label: 'Grant Dashboard',
          icon: <GrantsIcon />
        },
        {
          path: '/grants/donors',
          label: 'Partner Database',
          icon: <DonorIcon />
        },
        {
          path: '/grants/fund-tracking',
          label: 'Fund Tracking',
          icon: <FinanceIcon />
        }
      ]
    },
    {
      id: 'compliance',
      label: 'Compliance & Audit',
      icon: <ComplianceIcon />,
      comingSoon: true,
      items: [
        {
          path: '/compliance',
          label: 'Compliance Dashboard',
          icon: <ComplianceIcon />
        },
        {
          path: '/compliance/audit',
          label: 'Audit Trail',
          icon: <AuditIcon />
        },
        {
          path: '/compliance/documents',
          label: 'Document Storage',
          icon: <FolderIcon />
        }
      ]
    },
    {
      id: 'me',
      label: 'Monitoring & Evaluation',
      icon: <MEIcon />,
      comingSoon: true,
      items: [
        {
          path: '/me',
          label: 'M&E Dashboard',
          icon: <MEIcon />
        },
        {
          path: '/me/indicators',
          label: 'Indicators & KPIs',
          icon: <IndicatorsIcon />
        }
      ]
    },
    {
      id: 'admin',
      label: 'Administration',
      icon: <AdminIcon />,
      roles: ['ADMIN'] as UserRole[],
      items: [
        {
          path: '/admin/overview',
          label: 'Overall Admin',
          icon: <DashboardIcon />,
          roles: ['ADMIN'] as UserRole[]
        },
        {
          path: '/admin/users',
          label: 'User Management',
          icon: <UserMgmtIcon />,
          roles: ['ADMIN'] as UserRole[]
        },
        {
          path: '/admin/departments',
          label: 'Department Management',
          icon: <OrgIcon />,
          roles: ['ADMIN'] as UserRole[]
        },
        {
          path: '/admin/access-control',
          label: 'Access Control',
          icon: <ComplianceIcon />,
          roles: ['ADMIN'] as UserRole[]
        },
        {
          path: '/admin/settings',
          label: 'System Settings',
          icon: <SettingsIcon />,
          roles: ['ADMIN'] as UserRole[]
        }
      ]
    }
  ];

  // Filter sections and items based on role/permissions
  const filteredSections = navSections
    .filter(section => {
      // Procurement Committee members only have access to the Procurement module
      if (hasRole('PROCUREMENT_COMMITTEE') && section.id !== 'procurement') return false;
      if (section.roles && !hasRole(...section.roles)) return false;
      if (section.permission && !hasPermission(section.permission)) return false;
      return true;
    })
    .map(section => ({
      ...section,
      items: section.items.filter(item => {
        if (item.roles && !hasRole(...item.roles)) return false;
        if (item.permission && !hasPermission(item.permission)) return false;
        return true;
      })
    }))
    .filter(section => section.items.length > 0);

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const handleNavClick = (path: string) => {
    navigate(path);
    if (isMobile) setMobileOpen(false);
  };

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getRoleColor = (role: UserRole): 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' => {
    switch (role) {
      case 'ADMIN': return 'error';
      case 'FINANCE_CLERK': return 'success';
      case 'HEAD_OF_PROGRAMS': return 'secondary';
      case 'PROGRAM_LEAD': return 'primary';
      case 'PROCUREMENT_OFFICER': return 'warning';
      case 'PROCUREMENT_COMMITTEE': return 'secondary';
      default: return 'default';
    }
  };

  const getRoleLabel = (role: UserRole): string => {
    switch (role) {
      case 'ADMIN': return 'System Admin';
      case 'FINANCE_CLERK': return 'Finance Clerk';
      case 'HEAD_OF_PROGRAMS': return 'Head of Programs';
      case 'PROGRAM_LEAD': return 'Program Lead';
      case 'PROCUREMENT_OFFICER': return 'Procurement Officer';
      case 'PROCUREMENT_COMMITTEE': return 'Procurement Committee';
      default: return 'General User';
    }
  };

  const isPathActive = (path: string) => {
    if (path === '/finance/requests' && location.pathname === '/finance/requests') return true;
    if (path === '/finance/requests/create' && location.pathname === '/finance/requests/create') return true;
    if (path === '/finance/requests' && location.pathname.startsWith('/finance/requests/') && !location.pathname.includes('/create')) return false;
    return location.pathname === path;
  };

  const isSectionActive = (section: NavSection) => {
    return section.items.some(item => isPathActive(item.path)) || 
           location.pathname.startsWith(`/${section.id}`);
  };

  // Get breadcrumbs from current path
  const getBreadcrumbs = () => {
    const pathSegments = location.pathname.split('/').filter(Boolean);
    const breadcrumbs: { label: string; path: string }[] = [];
    
    const labelMap: Record<string, string> = {
      'finance': 'Float Requisition',
      'requests': 'Requests',
      'create': 'Create',
      'approvals': 'Approvals',
      'budgets': 'Budget Lines',
      'manage': 'Manage',
      'donors': 'Partners',
      'dispatch': 'Dispatch',
      'reconciliation': 'Reconciliation',
      'assets': 'Asset Management',
      'hr': 'Human Resources',
      'reports': 'Reports',
      'dashboard': 'Dashboard',
      'projects': 'Projects & Programs',
      'milestones': 'Milestones',
      'procurement': 'Procurement',
      'vendors': 'Vendors',
      'tenders': 'Tendering',
      'grants': 'Grants & Partners',
      'fund-tracking': 'Fund Tracking',
      'compliance': 'Compliance & Audit',
      'audit': 'Audit Trail',
      'documents': 'Documents',
      'me': 'Monitoring & Evaluation',
      'indicators': 'Indicators',
      'admin': 'Administration',
      'overview': 'Overall Admin',
      'users': 'User Management',
      'access-control': 'Access Control',
      'settings': 'Settings'
    };

    let currentPath = '';
    pathSegments.forEach(segment => {
      currentPath += `/${segment}`;
      if (labelMap[segment]) {
        breadcrumbs.push({ label: labelMap[segment], path: currentPath });
      }
    });

    return breadcrumbs;
  };

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Logo/Brand */}
      <Box sx={{ 
        p: 2.5, 
        display: 'flex', 
        alignItems: 'center', 
        gap: 1.5,
        borderBottom: `1px solid ${theme.palette.divider}`
      }}>
        <Box sx={{ 
          p: 1, 
          borderRadius: 2, 
          background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <OrgIcon sx={{ color: 'white', fontSize: 28 }} />
        </Box>
        <Box>
          <Typography variant="subtitle1" fontWeight="bold" color="primary.dark" lineHeight={1.2}>
            ERP Connect
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Together, Let&apos;s Make the World a Better Place
          </Typography>
        </Box>
      </Box>

      {/* User Info */}
      {user && (
        <Box sx={{ 
          px: 2, 
          py: 1.5,
          borderBottom: `1px solid ${theme.palette.divider}`,
          bgcolor: alpha(theme.palette.primary.main, 0.03)
        }}>
          <Box display="flex" alignItems="center" gap={1.5}>
            <Avatar sx={{ 
              bgcolor: 'primary.main', 
              width: 40, 
              height: 40,
              fontSize: '0.9rem',
              fontWeight: 600
            }}>
              {user.first_name[0]}{user.last_name[0]}
            </Avatar>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {user.first_name} {user.last_name}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap display="block">
                {user.department_name}
              </Typography>
              <Chip 
                label={getRoleLabel(user.role)} 
                color={getRoleColor(user.role)} 
                size="small"
                sx={{ mt: 0.5, height: 20, fontSize: '0.65rem' }}
              />
            </Box>
          </Box>
        </Box>
      )}

      {/* Dashboard Link */}
      <List sx={{ px: 1, pt: 1 }}>
        <ListItem disablePadding>
          <ListItemButton
            selected={location.pathname === '/dashboard' || location.pathname === '/'}
            onClick={() => handleNavClick('/dashboard')}
            sx={{
              borderRadius: 1.5,
              mb: 0.5,
              '&.Mui-selected': {
                backgroundColor: alpha(theme.palette.primary.main, 0.1),
                color: theme.palette.primary.main,
                '& .MuiListItemIcon-root': { color: theme.palette.primary.main },
                '&:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.15) }
              }
            }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <DashboardIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText 
              primary="Dashboard" 
              primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500 }}
            />
          </ListItemButton>
        </ListItem>
      </List>

      <Divider sx={{ mx: 2 }} />

      {/* Module Navigation */}
      <Box sx={{ flex: 1, overflowY: 'auto', px: 1, pt: 0.5 }}>
        <Typography variant="overline" sx={{ px: 2, pt: 1.5, pb: 0.5, display: 'block', color: 'text.disabled', fontSize: '0.65rem', letterSpacing: 1.5 }}>
          Modules
        </Typography>
        <List disablePadding>
          {filteredSections.map((section) => (
            <React.Fragment key={section.id}>
              <ListItem disablePadding>
                <Tooltip
                  title={section.comingSoon ? 'This module is coming soon and is not available yet.' : ''}
                  placement="right"
                  arrow
                  disableHoverListener={!section.comingSoon}
                >
                  <span style={{ display: 'block', width: '100%' }}>
                    <ListItemButton
                      onClick={() => !section.comingSoon && toggleSection(section.id)}
                      disabled={section.comingSoon}
                      sx={{
                        borderRadius: 1.5,
                        mb: 0.25,
                        py: 0.75,
                        ...(section.comingSoon && {
                          opacity: 0.6,
                          cursor: 'not-allowed',
                          pointerEvents: 'none',
                          '&.Mui-disabled': { opacity: 0.6 }
                        }),
                        ...(!section.comingSoon && isSectionActive(section) && {
                          bgcolor: alpha(theme.palette.primary.main, 0.05),
                        })
                      }}
                    >
                      <ListItemIcon sx={{ 
                        minWidth: 36,
                        color: section.comingSoon
                          ? 'text.disabled'
                          : (isSectionActive(section) ? theme.palette.primary.main : 'text.secondary')
                      }}>
                        {React.cloneElement(section.icon as React.ReactElement, { fontSize: 'small' })}
                      </ListItemIcon>
                      <ListItemText 
                        primary={section.label} 
                        primaryTypographyProps={{ 
                          fontSize: '0.8rem', 
                          fontWeight: (!section.comingSoon && isSectionActive(section)) ? 600 : 500,
                          color: section.comingSoon
                            ? 'text.disabled'
                            : (isSectionActive(section) ? 'primary.main' : 'text.primary')
                        }}
                      />
                      {section.comingSoon ? (
                        <Chip
                          label="Soon"
                          size="small"
                          sx={{
                            height: 18,
                            fontSize: '0.6rem',
                            bgcolor: 'warning.light',
                            color: 'warning.dark',
                            fontWeight: 600,
                            '& .MuiChip-label': { px: 0.75 }
                          }}
                        />
                      ) : (
                        expandedSections.includes(section.id) ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />
                      )}
                    </ListItemButton>
                  </span>
                </Tooltip>
              </ListItem>
              {!section.comingSoon && (
                <Collapse in={expandedSections.includes(section.id)} timeout="auto" unmountOnExit>
                  <List disablePadding>
                    {section.items.map((item) => (
                      <ListItem key={item.path} disablePadding>
                        <ListItemButton
                          selected={isPathActive(item.path)}
                          onClick={() => handleNavClick(item.path)}
                          sx={{
                            pl: 5,
                            py: 0.5,
                            borderRadius: 1.5,
                            mx: 0.5,
                            '&.Mui-selected': {
                              backgroundColor: alpha(theme.palette.primary.main, 0.1),
                              color: theme.palette.primary.main,
                              '& .MuiListItemIcon-root': { color: theme.palette.primary.main },
                              '&:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.15) }
                            }
                          }}
                        >
                          {item.icon && (
                            <ListItemIcon sx={{ minWidth: 30 }}>
                              {React.cloneElement(item.icon as React.ReactElement, { 
                                fontSize: 'small',
                                sx: { fontSize: '1rem' }
                              })}
                            </ListItemIcon>
                          )}
                          <ListItemText 
                            primary={item.label} 
                            primaryTypographyProps={{ fontSize: '0.8rem' }}
                          />
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                </Collapse>
              )}
            </React.Fragment>
          ))}
        </List>
      </Box>

      {/* Footer */}
      <Divider />
      <Box sx={{ p: 1.5 }}>
        <Typography variant="caption" color="text.disabled" textAlign="center" display="block">
          ERP Connect v1.0.0
        </Typography>
      </Box>
    </Box>
  );

  const breadcrumbs = getBreadcrumbs();

  return (
    <Box sx={{ display: 'flex' }}>
      {/* App Bar */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
          backgroundColor: 'white',
          color: 'text.primary',
          borderBottom: `1px solid ${theme.palette.divider}`
        }}
      >
        <Toolbar sx={{ minHeight: '56px !important' }}>
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          
          {/* Breadcrumbs */}
          <Breadcrumbs 
            separator={<ChevronRightIcon sx={{ fontSize: 16 }} />}
            sx={{ flexGrow: 1 }}
          >
            <Link
              underline="hover"
              color="inherit"
              href="#"
              onClick={(e: React.MouseEvent) => { e.preventDefault(); navigate('/dashboard'); }}
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.85rem' }}
            >
              <HomeIcon sx={{ fontSize: 16 }} />
              Home
            </Link>
            {breadcrumbs.map((crumb, index) => (
              index === breadcrumbs.length - 1 ? (
                <Typography key={crumb.path} color="text.primary" fontSize="0.85rem" fontWeight={500}>
                  {crumb.label}
                </Typography>
              ) : (
                <Link
                  key={crumb.path}
                  underline="hover"
                  color="inherit"
                  href="#"
                  onClick={(e: React.MouseEvent) => { e.preventDefault(); navigate(crumb.path); }}
                  sx={{ fontSize: '0.85rem' }}
                >
                  {crumb.label}
                </Link>
              )
            ))}
          </Breadcrumbs>

          {/* Notification Bell */}
          <Tooltip title="Notifications">
            <IconButton ref={notifAnchorRef} onClick={handleNotifToggle} sx={{ mr: 1 }}>
              <Badge badgeContent={notifCount > 0 ? notifCount : undefined} color="error" max={99}>
                <NotificationsIcon />
              </Badge>
            </IconButton>
          </Tooltip>

          {/* Notification Dropdown */}
          <Popper open={notifOpen} anchorEl={notifAnchorRef.current} placement="bottom-end" transition disablePortal style={{ zIndex: 1300 }}>
            {({ TransitionProps }) => (
              <Grow {...TransitionProps} style={{ transformOrigin: 'right top' }}>
                <Paper elevation={8} sx={{ width: 360, maxHeight: 480, overflow: 'hidden', border: `1px solid ${theme.palette.divider}`, borderRadius: 2, mt: 0.5 }}>
                  <ClickAwayListener onClickAway={handleNotifClose}>
                    <Box>
                      <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${theme.palette.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="subtitle2" fontWeight={600}>Notifications</Typography>
                        <Box display="flex" alignItems="center" gap={1}>
                          {notifCount > 0 && (
                            <Chip label={`${notifCount} unread`} size="small" color="primary" />
                          )}
                          {notifItems.some((n: any) => !n.is_read) && (
                            <Typography
                              variant="caption" color="primary.main"
                              sx={{ cursor: 'pointer', fontWeight: 600, '&:hover': { textDecoration: 'underline' } }}
                              onClick={handleMarkAllRead}
                            >
                              Mark all read
                            </Typography>
                          )}
                        </Box>
                      </Box>
                      <Box sx={{ overflowY: 'auto', maxHeight: 400 }}>
                        {notifLoading ? (
                          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                            <CircularProgress size={24} />
                          </Box>
                        ) : notifItems.length === 0 ? (
                          <Box sx={{ py: 4, textAlign: 'center' }}>
                            <NotificationsIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                            <Typography variant="body2" color="text.secondary">No notifications</Typography>
                          </Box>
                        ) : (
                          <List disablePadding>
                            {notifItems.map((item: any, index: number) => (
                              <React.Fragment key={item.id}>
                                {index > 0 && <Divider />}
                                <ListItem
                                  button
                                  onClick={() => {
                                    if (!item.is_read) handleMarkOneRead(item.id);
                                    setNotifOpen(false);
                                    if (item.link) navigate(item.link);
                                  }}
                                  sx={{
                                    px: 2, py: 1.2,
                                    bgcolor: item.is_read ? 'transparent' : alpha(theme.palette.primary.main, 0.06),
                                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.1) }
                                  }}
                                >
                                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: item.is_read ? 'text.disabled' : getNotifColor(item.type), mr: 1.5, flexShrink: 0, mt: 0.5 }} />
                                  <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="body2" fontWeight={item.is_read ? 400 : 600} noWrap>{item.title}</Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.message}</Typography>
                                    <Typography variant="caption" color="text.disabled">
                                      {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
                                    </Typography>
                                  </Box>
                                </ListItem>
                              </React.Fragment>
                            ))}
                          </List>
                        )}
                      </Box>
                    </Box>
                  </ClickAwayListener>
                </Paper>
              </Grow>
            )}
          </Popper>

          <IconButton onClick={handleMenuOpen}>
            <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32, fontSize: '0.8rem' }}>
              {user?.first_name[0]}{user?.last_name[0]}
            </Avatar>
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          >
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="subtitle2">{user?.first_name} {user?.last_name}</Typography>
              <Typography variant="caption" color="text.secondary">{user?.email}</Typography>
            </Box>
            <Divider />
            <MenuItem onClick={() => { handleMenuClose(); navigate('/profile'); }}>
              <ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>
              Profile
            </MenuItem>
            <MenuItem onClick={() => { handleMenuClose(); navigate('/settings'); }}>
              <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
              Settings
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon><LogoutIcon fontSize="small" color="error" /></ListItemIcon>
              <Typography color="error">Logout</Typography>
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Sidebar Drawer */}
      <Box
        component="nav"
        sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { 
              boxSizing: 'border-box', 
              width: DRAWER_WIDTH,
              borderRight: `1px solid ${theme.palette.divider}`
            }
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': { 
              boxSizing: 'border-box', 
              width: DRAWER_WIDTH,
              borderRight: `1px solid ${theme.palette.divider}`
            }
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          minHeight: '100vh',
          backgroundColor: '#f8f9fa'
        }}
      >
        <Toolbar sx={{ minHeight: '56px !important' }} />
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default Navigation;
