/**
 * Main Navigation Component
 * Role-based navigation sidebar/menu
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
  Badge,
  Chip,
  useTheme,
  useMediaQuery
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
  Person as PersonIcon
} from '@mui/icons-material';
import { useAuthStore } from '../../store/authStore';
import { UserRole } from '../../types';

const DRAWER_WIDTH = 260;

// Navigation items configuration with role-based visibility
interface NavItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  roles?: UserRole[];
  permission?: string;
  badge?: number;
}

const Navigation: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, hasRole, hasPermission } = useAuthStore();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  // Define navigation items with role restrictions
  const navItems: NavItem[] = [
    {
      path: '/dashboard',
      label: 'Dashboard',
      icon: <DashboardIcon />
    },
    {
      path: '/requests',
      label: 'My Requests',
      icon: <RequestIcon />,
      roles: ['GENERAL_USER']
    },
    {
      path: '/requests/create',
      label: 'Create Request',
      icon: <CreateIcon />,
      roles: ['GENERAL_USER']
    },
    {
      path: '/approvals',
      label: 'Pending Approvals',
      icon: <ApprovalsIcon />,
      roles: ['PROGRAM_LEAD', 'HEAD_OF_PROGRAMS', 'FINANCE_CLERK']
    },
    {
      path: '/budgets',
      label: 'Budget Lines',
      icon: <BudgetIcon />,
      permission: 'view_budget_lines'
    },
    {
      path: '/budgets/manage',
      label: 'Manage Budgets',
      icon: <SettingsIcon />,
      roles: ['FINANCE_CLERK']
    },
    {
      path: '/dispatch',
      label: 'Dispatch Desk',
      icon: <DispatchIcon />,
      roles: ['FINANCE_CLERK'] // Only Finance team can access Dispatch Desk
    },
    {
      path: '/reports',
      label: 'Reports',
      icon: <ReportsIcon />,
      permission: 'view_reports'
    }
  ];

  // Filter navigation items based on user role/permissions
  const filteredNavItems = navItems.filter(item => {
    if (item.roles && !hasRole(...item.roles)) return false;
    if (item.permission && !hasPermission(item.permission)) return false;
    return true;
  });

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleNavClick = (path: string) => {
    navigate(path);
    if (isMobile) setMobileOpen(false);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getRoleColor = (role: UserRole): 'default' | 'primary' | 'secondary' | 'success' | 'warning' => {
    switch (role) {
      case 'FINANCE_CLERK': return 'success';
      case 'HEAD_OF_PROGRAMS': return 'secondary';
      case 'PROGRAM_LEAD': return 'primary';
      default: return 'default';
    }
  };

  const getRoleLabel = (role: UserRole): string => {
    switch (role) {
      case 'FINANCE_CLERK': return 'Finance';
      case 'HEAD_OF_PROGRAMS': return 'HOP';
      case 'PROGRAM_LEAD': return 'Lead';
      default: return 'User';
    }
  };

  const drawer = (
    <Box>
      {/* Logo/Brand */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <BudgetIcon sx={{ color: 'primary.main', fontSize: 32 }} />
        <Box>
          <Typography variant="h6" fontWeight="bold" color="primary">
            Float Request System
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Management Module
          </Typography>
        </Box>
      </Box>
      
      <Divider />

      {/* User Info */}
      {user && (
        <Box sx={{ p: 2 }}>
          <Box display="flex" alignItems="center" gap={1} mb={1}>
            <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36 }}>
              {user.first_name[0]}{user.last_name[0]}
            </Avatar>
            <Box>
              <Typography variant="body2" fontWeight="medium">
                {user.first_name} {user.last_name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {user.department_name}
              </Typography>
            </Box>
          </Box>
          <Chip 
            label={getRoleLabel(user.role)} 
            color={getRoleColor(user.role)} 
            size="small"
            sx={{ width: '100%' }}
          />
        </Box>
      )}

      <Divider />

      {/* Navigation Items */}
      <List>
        {filteredNavItems.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => handleNavClick(item.path)}
              sx={{
                mx: 1,
                borderRadius: 1,
                '&.Mui-selected': {
                  backgroundColor: 'primary.light',
                  '&:hover': {
                    backgroundColor: 'primary.light'
                  }
                }
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                {item.badge ? (
                  <Badge badgeContent={item.badge} color="error">
                    {item.icon}
                  </Badge>
                ) : (
                  item.icon
                )}
              </ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  // Import AccountBalance icon that was missed
  const AccountBalance = BudgetIcon;

  return (
    <Box sx={{ display: 'flex' }}>
      {/* App Bar */}
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
          backgroundColor: 'white',
          color: 'text.primary',
          boxShadow: 1
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {/* Current page title could go here */}
          </Typography>

          {/* User Menu */}
          <IconButton onClick={handleMenuOpen}>
            <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32 }}>
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
            <MenuItem onClick={() => { handleMenuClose(); navigate('/profile'); }}>
              <ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>
              Profile
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
              Logout
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* Sidebar Drawer */}
      <Box
        component="nav"
        sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}
      >
        {/* Mobile drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH }
          }}
        >
          {drawer}
        </Drawer>

        {/* Desktop drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_WIDTH }
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
          p: 3,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          minHeight: '100vh',
          backgroundColor: 'grey.100'
        }}
      >
        <Toolbar /> {/* Spacer for fixed AppBar */}
        {children}
      </Box>
    </Box>
  );
};

export default Navigation;
