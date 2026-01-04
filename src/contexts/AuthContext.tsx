import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type AppRole = 'admin' | 'staff' | 'card_member' | 'member';
type MemberType = 'regular' | 'card';

interface Profile {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  member_type: MemberType;
  card_image_url: string | null;
  preferred_language: string;
  is_regular_attendee: boolean;
}

interface UserRole {
  role: AppRole;
  is_approved: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: UserRole[];
  isLoading: boolean;
  isStaff: boolean;
  isAdmin: boolean;
  isCardMember: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string, memberType: MemberType, requestedRole?: AppRole) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchProfile = async (userId: string) => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    
    if (profileData) {
      setProfile(profileData as Profile);
    }
  };

  const fetchRoles = async (userId: string) => {
    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('role, is_approved')
      .eq('user_id', userId);
    
    if (rolesData) {
      setRoles(rolesData as UserRole[]);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
      await fetchRoles(user.id);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        setTimeout(() => {
          fetchProfile(session.user.id);
          fetchRoles(session.user.id);
        }, 0);
      } else {
        setProfile(null);
        setRoles([]);
      }
      
      setIsLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchProfile(session.user.id);
        fetchRoles(session.user.id);
      }
      
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (
    email: string, 
    password: string, 
    fullName: string, 
    memberType: MemberType,
    requestedRole?: AppRole
  ) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
          member_type: memberType,
        }
      }
    });

    if (error) return { error };

    if (data.user) {
      // Create user role
      const role: AppRole = requestedRole || (memberType === 'card' ? 'card_member' : 'member');
      const isAutoApproved = role === 'member' || role === 'card_member';
      
      await supabase.from('user_roles').insert({
        user_id: data.user.id,
        role: role,
        is_approved: isAutoApproved,
      });

      // If staff, create pending approval
      if (role === 'staff' || role === 'admin') {
        await supabase.from('pending_staff_approvals').insert({
          user_id: data.user.id,
          email: email,
          full_name: fullName,
        });
        
        // Trigger email notification via edge function
        try {
          await supabase.functions.invoke('send-staff-approval-email', {
            body: { email, fullName, userId: data.user.id }
          });
        } catch (e) {
          console.log('Email notification failed, but signup succeeded');
        }
      }
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
  };

  const isStaff = roles.some(r => (r.role === 'staff' || r.role === 'admin') && r.is_approved);
  const isAdmin = roles.some(r => r.role === 'admin' && r.is_approved);
  const isCardMember = profile?.member_type === 'card' || roles.some(r => r.role === 'card_member');

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      roles,
      isLoading,
      isStaff,
      isAdmin,
      isCardMember,
      signIn,
      signUp,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
