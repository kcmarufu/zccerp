/**
 * Main Navigation Component
 * Professional ERP sidebar with module-based navigation
 */

import React, { useState } from 'react';
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
  alpha
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
          roles: ['PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'FINANCE_CLERK']
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
          roles: ['FINANCE_CLERK']
        },
        {
          path: '/finance/budgets',
          label: 'Budget Lines',
          icon: <BudgetIcon />,
          permission: 'view_budget_lines'
        },
        {
          path: '/finance/donors',
          label: 'Donor Management',
          icon: <DonorIcon />,
          roles: ['FINANCE_CLERK']
        }
      ]
    },
    {
      id: 'assets',
      label: 'Asset Management',
      icon: <AssetIcon />,
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
      id: 'hr',
      label: 'Human Resources',
      icon: <HRIcon />,
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
      id: 'projects',
      label: 'Projects & Programs',
      icon: <ProjectsIcon />,
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
          path: '/procurement/vendors',
          label: 'Vendor Management',
          icon: <StakeholdersIcon />
        },
        {
          path: '/procurement/tenders',
          label: 'Tendering & Bidding',
          icon: <TenderIcon />
        }
      ]
    },
    {
      id: 'grants',
      label: 'Grants & Donors',
      icon: <GrantsIcon />,
      items: [
        {
          path: '/grants',
          label: 'Grant Dashboard',
          icon: <GrantsIcon />
        },
        {
          path: '/grants/donors',
          label: 'Donor Database',
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
          path: '/admin/users',
          label: 'User Management',
          icon: <UserMgmtIcon />,
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
      default: return 'default';
    }
  };

  const getRoleLabel = (role: UserRole): string => {
    switch (role) {
      case 'ADMIN': return 'System Admin';
      case 'FINANCE_CLERK': return 'Finance Clerk';
      case 'HEAD_OF_PROGRAMS': return 'Head of Programs';
      case 'PROGRAM_LEAD': return 'Program Lead';
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
      'donors': 'Donors',
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
      'grants': 'Grants & Donors',
      'fund-tracking': 'Fund Tracking',
      'compliance': 'Compliance & Audit',
      'audit': 'Audit Trail',
      'documents': 'Documents',
      'me': 'Monitoring & Evaluation',
      'indicators': 'Indicators',
      'admin': 'Administration',
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
            ZCC ERP
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Enterprise Resource Planning
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
                <ListItemButton
                  onClick={() => toggleSection(section.id)}
                  sx={{
                    borderRadius: 1.5,
                    mb: 0.25,
                    py: 0.75,
                    ...(isSectionActive(section) && {
                      bgcolor: alpha(theme.palette.primary.main, 0.05),
                    })
                  }}
                >
                  <ListItemIcon sx={{ 
                    minWidth: 36,
                    color: isSectionActive(section) ? theme.palette.primary.main : 'text.secondary'
                  }}>
                    {React.cloneElement(section.icon as React.ReactElement, { fontSize: 'small' })}
                  </ListItemIcon>
                  <ListItemText 
                    primary={section.label} 
                    primaryTypographyProps={{ 
                      fontSize: '0.8rem', 
                      fontWeight: isSectionActive(section) ? 600 : 500,
                      color: isSectionActive(section) ? 'primary.main' : 'text.primary'
                    }}
                  />
                  {expandedSections.includes(section.id) ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                </ListItemButton>
              </ListItem>
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
            </React.Fragment>
          ))}
        </List>
      </Box>

      {/* Footer */}
      <Divider />
      <Box sx={{ p: 1.5 }}>
        <Typography variant="caption" color="text.disabled" textAlign="center" display="block">
          ZCC ERP v1.0.0
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

          {/* Notification & User */}
          <Tooltip title="Notifications">
            <IconButton sx={{ mr: 1 }}>
              <Badge badgeContent={0} color="error">
                <NotificationsIcon />
              </Badge>
            </IconButton>
          </Tooltip>

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
