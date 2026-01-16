import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { sendWorkoutNotification } from '@/lib/sendWorkoutNotification';
import { Logo } from '@/components/Logo';
import { LanguageSelector } from '@/components/LanguageSelector';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, Plus, Edit, Trash2, Calendar, Clock, Users, 
  UserCheck, CheckCircle, XCircle, Crown, MoreVertical, ArrowUp, ArrowDown, UserMinus, UserPlus, UserX, Camera, Loader2, UsersRound, Sunrise, Moon
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { motion } from 'framer-motion';

interface Workout {
  id: string;
  title: string;
  title_bg: string | null;
  description: string | null;
  description_bg: string | null;
  workout_date: string;
  start_time: string;
  end_time: string;
  max_spots: number;
  card_priority_enabled: boolean;
  reservation_opens_hours: number;
  auto_reserve_enabled: boolean;
  auto_reserve_executed: boolean;
  created_by: string;
  workout_type: 'early' | 'late';
}

interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  email?: string;
  phone?: string | null;
  member_type: string;
  card_image_url: string | null;
  auto_reserve_enabled?: boolean;
  preferred_workout_type?: string | null;
}

interface UserRole {
  id: string;
  user_id: string;
  role: string;
  is_approved: boolean;
}

interface Reservation {
  id: string;
  workout_id: string;
  user_id: string;
  reserved_at?: string;
  profiles?: Profile;
}

interface PendingApproval {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  requested_at: string;
}

interface MemberWithRole extends Profile {
  roles: UserRole[];
}

export default function StaffDashboard() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { user, isStaff, isAdmin, isLoading } = useAuth();
  const { toast } = useToast();
  
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [members, setMembers] = useState<MemberWithRole[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberWithRole | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [workoutReservations, setWorkoutReservations] = useState<Reservation[]>([]);
  const [workoutAttendance, setWorkoutAttendance] = useState<Record<string, boolean>>({});
  const [uploadingCardImage, setUploadingCardImage] = useState(false);
  const [manageMembersWorkout, setManageMembersWorkout] = useState<Workout | null>(null);
  const [manageMembersReservations, setManageMembersReservations] = useState<Reservation[]>([]);
  const [manageMembersWaitingList, setManageMembersWaitingList] = useState<{ id: string; user_id: string; position: number; profiles?: Profile }[]>([]);
  const [autoReserving, setAutoReserving] = useState(false);
  
  // Workout form
  const [showWorkoutDialog, setShowWorkoutDialog] = useState(false);
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);
  const [workoutForm, setWorkoutForm] = useState({
    title: '',
    title_bg: '',
    description: '',
    description_bg: '',
    workout_date: format(new Date(), 'yyyy-MM-dd'),
    start_time: '09:00',
    end_time: '10:00',
    max_spots: 10,
    card_priority_enabled: true,
    auto_reserve_enabled: true,
    reservation_opens_hours: 24,
    workout_type: 'early' as 'early' | 'late',
  });

  useEffect(() => {
    if (!isLoading && (!user || !isStaff)) {
      navigate('/dashboard');
    }
  }, [user, isStaff, isLoading, navigate]);

  useEffect(() => {
    fetchWorkouts();
    fetchMembers();
    if (isAdmin) {
      fetchPendingApprovals();
    }
  }, [isAdmin]);

  const fetchWorkouts = async () => {
    const { data } = await supabase
      .from('workouts')
      .select('*')
      .gte('workout_date', format(new Date(), 'yyyy-MM-dd'))
      .order('workout_date')
      .order('start_time');
    
    if (data) setWorkouts(data as Workout[]);
  };

  const fetchMembers = async () => {
    // Fetch profiles including auto-reserve preferences
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, user_id, full_name, email, phone, member_type, card_image_url, auto_reserve_enabled, preferred_workout_type')
      .order('full_name');
    
    if (profiles) {
      // Fetch roles for each profile
      const { data: roles } = await supabase
        .from('user_roles')
        .select('*');
      
      const membersWithRoles: MemberWithRole[] = profiles.map(p => ({
        ...p,
        roles: roles?.filter(r => r.user_id === p.user_id) || []
      }));
      
      setMembers(membersWithRoles);
    }
  };

  const fetchPendingApprovals = async () => {
    const { data } = await supabase
      .from('pending_staff_approvals')
      .select('*')
      .eq('is_processed', false)
      .order('requested_at', { ascending: false });
    
    if (data) setPendingApprovals(data as PendingApproval[]);
  };

  const fetchWorkoutReservations = async (workoutId: string) => {
    const { data: reservations } = await supabase
      .from('reservations')
      .select('*')
      .eq('workout_id', workoutId)
      .eq('is_active', true);
    
    if (reservations && reservations.length > 0) {
      const userIds = reservations.map(r => r.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, email, member_type, card_image_url, auto_reserve_enabled, preferred_workout_type')
        .in('user_id', userIds);
      
      const reservationsWithProfiles = reservations.map(r => ({
        ...r,
        profiles: profiles?.find(p => p.user_id === r.user_id),
      }));
      
      setWorkoutReservations(reservationsWithProfiles as Reservation[]);
    } else {
      setWorkoutReservations([]);
    }
    
    const { data: attendance } = await supabase
      .from('attendance')
      .select('*')
      .eq('workout_id', workoutId);
    
    if (attendance) {
      const attendanceMap: Record<string, boolean> = {};
      attendance.forEach(a => {
        attendanceMap[a.user_id] = a.attended ?? false;
      });
      setWorkoutAttendance(attendanceMap);
    }
  };

  const handleCreateWorkout = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('workouts')
      .insert({
        ...workoutForm,
        created_by: user.id,
      })
      .select()
      .single();
    
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      toast({ title: 'Workout created!' });
      setShowWorkoutDialog(false);
      resetWorkoutForm();
      fetchWorkouts();
      
      if (data) {
        // Auto-reserve for card members FIRST if card priority is enabled
        let autoReservedUserIds: string[] = [];
        
        if (data.card_priority_enabled && data.auto_reserve_enabled) {
          try {
            console.log('Triggering auto-reserve for new workout:', data.id);
            const { data: autoReserveResult, error: autoReserveError } = await supabase.functions.invoke('auto-reserve-card-members', {
              body: { workoutId: data.id }
            });
            if (autoReserveError) {
              console.error('Auto-reserve error:', autoReserveError);
            } else if (autoReserveResult?.reserved > 0) {
              console.log('Auto-reserved', autoReserveResult.reserved, 'spots');
              // The auto-reserve function already marks it as executed and sends notifications to reserved members
              fetchWorkouts();
            }
          } catch (e) {
            console.error('Auto-reserve failed:', e);
          }
        }
        
        // Send push notification for new workout to all non-card members
        // (card members already got notified via auto-reserve if applicable)
        try {
          // Get card member IDs to exclude from general notification if auto-reserve happened
          let excludeUserIds: string[] = [];
          if (data.card_priority_enabled) {
            const { data: cardMembers } = await supabase
              .from('profiles')
              .select('user_id')
              .eq('member_type', 'card');
            excludeUserIds = cardMembers?.map(m => m.user_id) || [];
          }
          
          await sendWorkoutNotification({
            type: 'new_workout',
            workoutId: data.id,
            workoutTitle: data.title,
            workoutTitleBg: data.title_bg,
            workoutDate: data.workout_date,
            workoutTime: data.start_time?.slice(0, 5),
            excludeUserIds: excludeUserIds,
          });
        } catch (e) {
          console.log('Push notification failed, but workout created');
        }
      }
    }
  };

  const handleUpdateWorkout = async () => {
    if (!editingWorkout) return;
    
    const { error } = await supabase
      .from('workouts')
      .update(workoutForm)
      .eq('id', editingWorkout.id);
    
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      toast({ title: 'Workout updated!' });
      setShowWorkoutDialog(false);
      setEditingWorkout(null);
      resetWorkoutForm();
      fetchWorkouts();
      
      // Send push notification for updated workout
      try {
        await sendWorkoutNotification({
          type: 'workout_updated',
          workoutId: editingWorkout.id,
          workoutTitle: workoutForm.title,
          workoutTitleBg: workoutForm.title_bg,
          workoutDate: workoutForm.workout_date,
          workoutTime: workoutForm.start_time?.slice(0, 5),
        });
      } catch (e) {
        console.log('Push notification failed');
      }
    }
  };

  const handleDeleteWorkout = async (workoutId: string) => {
    // Get workout details before deletion for notification
    const workoutToDelete = workouts.find(w => w.id === workoutId);
    
    const { error } = await supabase
      .from('workouts')
      .delete()
      .eq('id', workoutId);
    
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      toast({ title: 'Workout deleted' });
      fetchWorkouts();
      
      // Send push notification for deleted workout
      if (workoutToDelete) {
        try {
          await sendWorkoutNotification({
            type: 'workout_deleted',
            workoutId: workoutId,
            workoutTitle: workoutToDelete.title,
            workoutTitleBg: workoutToDelete.title_bg,
          });
        } catch (e) {
          console.log('Push notification failed');
        }
      }
    }
  };

  const handleAutoReserveCardMembers = async () => {
    setAutoReserving(true);
    const cardPriorityWorkouts = workouts.filter(w => w.card_priority_enabled);
    
    if (cardPriorityWorkouts.length === 0) {
      toast({ 
        title: language === 'bg' ? 'Няма подходящи тренировки' : 'No eligible workouts',
        description: language === 'bg' 
          ? 'Няма тренировки с приоритет за картови членове' 
          : 'No workouts with card member priority enabled'
      });
      setAutoReserving(false);
      return;
    }

    let totalReserved = 0;
    for (const workout of cardPriorityWorkouts) {
      try {
        const { data, error } = await supabase.functions.invoke('auto-reserve-card-members', {
          body: { workoutId: workout.id }
        });
        if (!error && data?.reserved) {
          totalReserved += data.reserved;
        }
      } catch (e) {
        console.error('Auto-reserve failed for workout:', workout.id, e);
      }
    }

    toast({ 
      title: language === 'bg' ? 'Авто-резервация завършена' : 'Auto-reserve complete',
      description: language === 'bg' 
        ? `${totalReserved} места резервирани за картови членове`
        : `${totalReserved} spots reserved for card members`
    });
    setAutoReserving(false);
    fetchWorkouts();
  };

  const handleMarkAttendance = async (workoutId: string, userId: string, attended: boolean) => {
    if (!user) return;
    
    const { error } = await supabase
      .from('attendance')
      .upsert({
        workout_id: workoutId,
        user_id: userId,
        attended,
        marked_by: user.id,
      }, { onConflict: 'workout_id,user_id' });
    
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      setWorkoutAttendance(prev => ({ ...prev, [userId]: attended }));
    }
  };

  const handleApproveStaff = async (approval: PendingApproval) => {
    if (!user) return;
    
    const { error: roleError } = await supabase
      .from('user_roles')
      .update({ is_approved: true, approved_by: user.id, approved_at: new Date().toISOString() })
      .eq('user_id', approval.user_id)
      .eq('role', 'staff');
    
    if (roleError) {
      toast({ variant: 'destructive', title: 'Error', description: roleError.message });
      return;
    }
    
    await supabase
      .from('pending_staff_approvals')
      .update({ is_processed: true })
      .eq('id', approval.id);
    
    toast({ title: 'Staff approved!' });
    fetchPendingApprovals();
    fetchMembers();
  };

  const handleRemoveMember = async (member: MemberWithRole) => {
    // Delete user roles first
    await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', member.user_id);
    
    // Delete profile
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('user_id', member.user_id);
    
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      toast({ title: t('memberRemoved') });
      fetchMembers();
    }
  };

  const handlePromoteToCard = async (member: MemberWithRole) => {
    // Update profile member_type
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ member_type: 'card' })
      .eq('user_id', member.user_id);
    
    if (profileError) {
      toast({ variant: 'destructive', title: 'Error', description: profileError.message });
      return;
    }
    
    // Check if user already has a role entry
    const memberRole = member.roles.find(r => r.role === 'member');
    const cardRole = member.roles.find(r => r.role === 'card_member');
    
    if (memberRole) {
      // Update existing member role to card_member
      await supabase
        .from('user_roles')
        .update({ role: 'card_member' })
        .eq('id', memberRole.id);
    } else if (!cardRole) {
      // Create new card_member role if none exists
      await supabase
        .from('user_roles')
        .insert({ 
          user_id: member.user_id, 
          role: 'card_member',
          is_approved: true 
        });
    }
    
    toast({ title: t('memberPromoted') });
    await fetchMembers();
    
    // Refetch and update selectedMember with latest data
    const { data: updatedProfile } = await supabase
      .from('profiles')
      .select('id, user_id, full_name, email, phone, member_type, card_image_url')
      .eq('user_id', member.user_id)
      .single();
    
    const { data: updatedRoles } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', member.user_id);
    
    if (updatedProfile && selectedMember?.user_id === member.user_id) {
      setSelectedMember({ ...updatedProfile, roles: updatedRoles || [] });
    }
  };

  const handleDemoteToMember = async (member: MemberWithRole) => {
    // Update profile member_type
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ member_type: 'regular' })
      .eq('user_id', member.user_id);
    
    if (profileError) {
      toast({ variant: 'destructive', title: 'Error', description: profileError.message });
      return;
    }
    
    // Check if user has card_member role
    const cardRole = member.roles.find(r => r.role === 'card_member');
    
    if (cardRole) {
      // Update card_member role to member
      await supabase
        .from('user_roles')
        .update({ role: 'member' })
        .eq('id', cardRole.id);
    }
    
    toast({ title: t('memberDemoted') });
    await fetchMembers();
    
    // Refetch and update selectedMember with latest data
    const { data: updatedProfile } = await supabase
      .from('profiles')
      .select('id, user_id, full_name, email, phone, member_type, card_image_url')
      .eq('user_id', member.user_id)
      .single();
    
    const { data: updatedRoles } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', member.user_id);
    
    if (updatedProfile && selectedMember?.user_id === member.user_id) {
      setSelectedMember({ ...updatedProfile, roles: updatedRoles || [] });
    }
  };

  const handleDeactivateMember = async (member: MemberWithRole) => {
    // Remove all roles except staff/admin to make member inactive
    const memberRoles = member.roles.filter(r => r.role === 'member' || r.role === 'card_member');
    
    for (const role of memberRoles) {
      await supabase
        .from('user_roles')
        .delete()
        .eq('id', role.id);
    }
    
    // Update profile to regular (inactive state is determined by no member/card_member roles)
    await supabase
      .from('profiles')
      .update({ member_type: 'regular' })
      .eq('user_id', member.user_id);
    
    toast({ title: t('deactivate') + ' - Success' });
    fetchMembers();
  };

  const handleActivateMember = async (member: MemberWithRole) => {
    // Check if user already has a member role
    const hasRole = member.roles.some(r => r.role === 'member' || r.role === 'card_member');
    
    if (!hasRole) {
      // Create new member role
      await supabase
        .from('user_roles')
        .insert({ 
          user_id: member.user_id, 
          role: 'member',
          is_approved: true 
        });
    }
    
    toast({ title: t('activate') + ' - Success' });
    fetchMembers();
  };

  const handleUpdateCardImage = async (member: MemberWithRole, file: File) => {
    if (!file) return;
    
    setUploadingCardImage(true);
    
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${member.user_id}/card-image.${fileExt}`;
      
      // Upload the file
      const { error: uploadError } = await supabase.storage
        .from('card-images')
        .upload(filePath, file, { upsert: true });
      
      if (uploadError) throw uploadError;
      
      // Get signed URL (private bucket)
      const { data: signedData, error: signedError } = await supabase.storage
        .from('card-images')
        .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1 year
      
      if (signedError) throw signedError;
      
      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ card_image_url: signedData.signedUrl })
        .eq('user_id', member.user_id);
      
      if (updateError) throw updateError;
      
      // Update local state
      setSelectedMember(prev => prev ? { ...prev, card_image_url: signedData.signedUrl } : null);
      fetchMembers();
      
      toast({ title: language === 'bg' ? 'Снимката е обновена' : 'Card image updated' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } finally {
      setUploadingCardImage(false);
    }
  };

  const handleRemoveStaff = async (member: MemberWithRole) => {
    const staffRole = member.roles.find(r => r.role === 'staff');
    if (staffRole) {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', staffRole.id);
      
      if (error) {
        toast({ variant: 'destructive', title: 'Error', description: error.message });
      } else {
        toast({ title: t('staffRemoved') });
        fetchMembers();
      }
    }
  };

  const fetchManageMembersReservations = async (workoutId: string) => {
    // Fetch reservations
    const { data: reservations } = await supabase
      .from('reservations')
      .select('*')
      .eq('workout_id', workoutId)
      .eq('is_active', true);
    
    if (reservations && reservations.length > 0) {
      const userIds = reservations.map(r => r.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, email, member_type, card_image_url, auto_reserve_enabled, preferred_workout_type')
        .in('user_id', userIds);
      
      const reservationsWithProfiles = reservations.map(r => ({
        ...r,
        profiles: profiles?.find(p => p.user_id === r.user_id),
      }));
      
      setManageMembersReservations(reservationsWithProfiles as Reservation[]);
    } else {
      setManageMembersReservations([]);
    }
    
    // Fetch waiting list
    const { data: waitingList } = await supabase
      .from('waiting_list')
      .select('*')
      .eq('workout_id', workoutId)
      .eq('is_active', true)
      .order('position');
    
    if (waitingList && waitingList.length > 0) {
      const waitingUserIds = waitingList.map(w => w.user_id);
      const { data: waitingProfiles } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, email, member_type, card_image_url')
        .in('user_id', waitingUserIds);
      
      const waitingWithProfiles = waitingList.map(w => ({
        ...w,
        profiles: waitingProfiles?.find(p => p.user_id === w.user_id),
      }));
      
      setManageMembersWaitingList(waitingWithProfiles);
    } else {
      setManageMembersWaitingList([]);
    }
  };

  const handleAddMemberToWorkout = async (workoutId: string, memberId: string) => {
    // First try to reactivate an existing inactive reservation
    const { data: existing } = await supabase
      .from('reservations')
      .select('id')
      .eq('workout_id', workoutId)
      .eq('user_id', memberId)
      .maybeSingle();

    let error;
    if (existing) {
      // Reactivate the existing reservation
      const result = await supabase
        .from('reservations')
        .update({ is_active: true, cancelled_at: null, reserved_at: new Date().toISOString() })
        .eq('id', existing.id);
      error = result.error;
    } else {
      // Insert new reservation
      const result = await supabase
        .from('reservations')
        .insert({ workout_id: workoutId, user_id: memberId, is_active: true });
      error = result.error;
    }

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      toast({ title: language === 'bg' ? 'Членът е добавен' : 'Member added' });
      fetchManageMembersReservations(workoutId);

      // Check if workout is now full and notify staff
      const workout = workouts.find(w => w.id === workoutId);
      if (workout) {
        const { count } = await supabase
          .from('reservations')
          .select('*', { count: 'exact', head: true })
          .eq('workout_id', workoutId)
          .eq('is_active', true);

        if (count && count >= workout.max_spots) {
          // Notify when workout is full (unified notification handles staff targeting for this type)
          try {
            await sendWorkoutNotification({
              type: 'workout_full',
              workoutId: workout.id,
              workoutTitle: workout.title,
              workoutTitleBg: workout.title_bg,
            });
          } catch (e) {
            console.log('Push notification failed');
          }
        }
      }
    }
  };

  const handleRemoveMemberFromWorkout = async (workoutId: string, memberId: string) => {
    const { error } = await supabase
      .from('reservations')
      .update({ is_active: false, cancelled_at: new Date().toISOString() })
      .eq('workout_id', workoutId)
      .eq('user_id', memberId);

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    } else {
      toast({ title: language === 'bg' ? 'Членът е премахнат' : 'Member removed' });
      fetchManageMembersReservations(workoutId);
    }
  };

  const getMemberStatus = (member: MemberWithRole) => {
    // Staff/admin roles must be approved to be treated as staff.
    const isStaffMember = member.roles.some(
      (r) => (r.role === 'staff' || r.role === 'admin') && r.is_approved
    );

    // Check for active member/card_member roles
    const hasMemberRole = member.roles.some(r => r.role === 'member' || r.role === 'card_member');
    
    // Card status is driven primarily by the profile (source of truth for membership type).
    const isCard = member.member_type === 'card';

    if (isStaffMember) return 'staff';
    if (isCard && hasMemberRole) return 'card';
    if (hasMemberRole) return 'member';
    
    // No active member role means inactive
    return 'inactive';
  };

  const resetWorkoutForm = () => {
    setWorkoutForm({
      title: '',
      title_bg: '',
      description: '',
      description_bg: '',
      workout_date: format(new Date(), 'yyyy-MM-dd'),
      start_time: '09:00',
      end_time: '10:00',
      max_spots: 10,
      card_priority_enabled: true,
      auto_reserve_enabled: true,
      reservation_opens_hours: 24,
      workout_type: 'early',
    });
  };

  const openEditWorkout = (workout: Workout) => {
    setEditingWorkout(workout);
    // Use title as the unified value (title_bg should match title)
    const unifiedTitle = workout.title;
    const unifiedDescription = workout.description || '';
    setWorkoutForm({
      title: unifiedTitle,
      title_bg: unifiedTitle, // Keep synced
      description: unifiedDescription,
      description_bg: unifiedDescription, // Keep synced
      workout_date: workout.workout_date,
      start_time: workout.start_time,
      end_time: workout.end_time,
      max_spots: workout.max_spots,
      card_priority_enabled: workout.card_priority_enabled,
      auto_reserve_enabled: workout.auto_reserve_enabled ?? true,
      reservation_opens_hours: workout.reservation_opens_hours || 24,
      workout_type: workout.workout_type || 'early',
    });
    setShowWorkoutDialog(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t('loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Logo size="sm" />
          </div>
          <LanguageSelector variant="minimal" />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <h1 className="font-display text-2xl sm:text-3xl font-semibold mb-6">
          {isAdmin ? t('adminDashboard') : t('staffDashboard')}
        </h1>

        <Tabs defaultValue="workouts" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-grid">
            <TabsTrigger value="workouts">{t('workouts')}</TabsTrigger>
            <TabsTrigger value="members">{t('manageMembers')}</TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="approvals">
                {t('pendingApprovals')}
                {pendingApprovals.length > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {pendingApprovals.length}
                  </Badge>
                )}
              </TabsTrigger>
            )}
          </TabsList>

          {/* Workouts Tab */}
          <TabsContent value="workouts" className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <h2 className="font-display text-xl font-medium">{t('manageWorkouts')}</h2>
              <Dialog open={showWorkoutDialog} onOpenChange={setShowWorkoutDialog}>
                  <DialogTrigger asChild>
                    <Button onClick={() => { setEditingWorkout(null); resetWorkoutForm(); }}>
                      <Plus className="h-4 w-4 mr-2" />
                      {t('createWorkout')}
                    </Button>
                  </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="font-display">
                      {editingWorkout ? t('editWorkout') : t('createWorkout')}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    {/* Unified Title Field */}
                    <div className="space-y-2">
                      <Label>{t('workoutTitle')}</Label>
                      <Input
                        value={workoutForm.title}
                        onChange={(e) => setWorkoutForm(f => ({ 
                          ...f, 
                          title: e.target.value,
                          title_bg: e.target.value // Keep both in sync
                        }))}
                        placeholder={language === 'bg' ? 'Въведете заглавие' : 'Enter workout title'}
                      />
                    </div>
                    {/* Unified Description Field */}
                    <div className="space-y-2">
                      <Label>{t('description')}</Label>
                      <Textarea
                        value={workoutForm.description}
                        onChange={(e) => setWorkoutForm(f => ({ 
                          ...f, 
                          description: e.target.value,
                          description_bg: e.target.value // Keep both in sync
                        }))}
                        placeholder={language === 'bg' ? 'Въведете описание (по избор)' : 'Enter description (optional)'}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t('date')}</Label>
                        <Input
                          type="date"
                          value={workoutForm.workout_date}
                          onChange={(e) => setWorkoutForm(f => ({ ...f, workout_date: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t('workoutType')}</Label>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant={workoutForm.workout_type === 'early' ? 'default' : 'outline'}
                            size="sm"
                            className="flex-1"
                            onClick={() => setWorkoutForm(f => ({ ...f, workout_type: 'early' }))}
                          >
                            {t('early')}
                          </Button>
                          <Button
                            type="button"
                            variant={workoutForm.workout_type === 'late' ? 'default' : 'outline'}
                            size="sm"
                            className="flex-1"
                            onClick={() => setWorkoutForm(f => ({ ...f, workout_type: 'late' }))}
                          >
                            {t('late')}
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t('startTime')}</Label>
                        <Input
                          type="time"
                          value={workoutForm.start_time}
                          onChange={(e) => setWorkoutForm(f => ({ ...f, start_time: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t('endTime')}</Label>
                        <Input
                          type="time"
                          value={workoutForm.end_time}
                          onChange={(e) => setWorkoutForm(f => ({ ...f, end_time: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('maxSpots')}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={workoutForm.max_spots}
                        onChange={(e) => setWorkoutForm(f => ({ ...f, max_spots: parseInt(e.target.value) || 1 }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('reservationOpensHours')}</Label>
                      <Input
                        type="number"
                        min={1}
                        value={workoutForm.reservation_opens_hours}
                        onChange={(e) => setWorkoutForm(f => ({ ...f, reservation_opens_hours: parseInt(e.target.value) || 24 }))}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('cardPriorityPeriod')}: {Math.floor(workoutForm.reservation_opens_hours / 2)} {language === 'bg' ? 'часа' : 'hours'}
                      </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>{t('cardPriority')}</Label>
                      <Switch
                        checked={workoutForm.card_priority_enabled}
                        onCheckedChange={(checked) => setWorkoutForm(f => ({ 
                          ...f, 
                          card_priority_enabled: checked,
                          auto_reserve_enabled: checked ? f.auto_reserve_enabled : false
                        }))}
                      />
                    </div>
                    {workoutForm.card_priority_enabled && (
                      <div className="flex items-center justify-between pl-4 border-l-2 border-primary/20">
                        <div>
                          <Label>{language === 'bg' ? 'Авто-резервация' : 'Auto-reserve'}</Label>
                          <p className="text-xs text-muted-foreground">
                            {language === 'bg' 
                              ? 'Автоматично запазва места за картови членове'
                              : 'Automatically reserve spots for card members'}
                          </p>
                        </div>
                        <Switch
                          checked={workoutForm.auto_reserve_enabled}
                          onCheckedChange={(checked) => setWorkoutForm(f => ({ ...f, auto_reserve_enabled: checked }))}
                        />
                      </div>
                    )}
                    <Button 
                      className="w-full" 
                      onClick={editingWorkout ? handleUpdateWorkout : handleCreateWorkout}
                    >
                      {editingWorkout ? t('save') : t('createWorkout')}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-4">
              {workouts.map((workout) => (
                <Card key={workout.id} className="border-border/50">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <h3 className="font-display text-lg font-semibold">
                          {workout.title}
                        </h3>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {format(parseISO(workout.workout_date), 'MMM d, yyyy')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {workout.start_time.slice(0, 5)} - {workout.end_time.slice(0, 5)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            {workout.max_spots} spots
                          </span>
                        </div>
                        <Badge variant={workout.workout_type === 'early' ? 'default' : 'secondary'} className="text-xs">
                          {t(workout.workout_type || 'early')}
                        </Badge>
                        {workout.card_priority_enabled && (
                          <Badge variant="outline" className="text-xs">
                            <Crown className="h-3 w-3 mr-1" />
                            {t('cardPriority')}
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setManageMembersWorkout(workout);
                            fetchManageMembersReservations(workout.id);
                          }}
                        >
                          <UsersRound className="h-4 w-4 mr-1" />
                          {language === 'bg' ? 'Членове' : 'Members'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedWorkout(workout);
                            fetchWorkoutReservations(workout.id);
                          }}
                        >
                          <UserCheck className="h-4 w-4 mr-1" />
                          {t('attendance')}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEditWorkout(workout)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteWorkout(workout.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Members Tab */}
          <TabsContent value="members" className="space-y-4">
            <h2 className="font-display text-xl font-medium">{t('manageMembers')}</h2>
            <div className="grid gap-3">
              {members.map((member) => {
                const status = getMemberStatus(member);
                return (
                  <Card key={member.id} className="border-border/50">
                    <CardContent className="p-4 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setSelectedMember(member)}
                        className="flex items-center gap-3 text-left"
                      >
                        {status === 'card' ? (
                          member.card_image_url ? (
                            <img
                              src={member.card_image_url}
                              alt={`Membership card photo for ${member.full_name || 'member'}`}
                              className="h-12 w-12 rounded-lg object-cover ring-2 ring-primary/30"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center ring-2 ring-primary/30">
                              <Camera className="h-5 w-5 text-primary/50" />
                            </div>
                          )
                        ) : member.card_image_url ? (
                          <img
                            src={member.card_image_url}
                            alt={`Photo for ${member.full_name || 'member'}`}
                            className="h-10 w-10 rounded object-cover"
                            loading="lazy"
                          />
                        ) : null}
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{member.full_name || 'Member'}</span>
                            {status === 'card' && (
                              <Badge className="bg-primary/20">
                                <Crown className="h-3 w-3 mr-1" />
                                {t('cardMember')}
                              </Badge>
                            )}
                            {status === 'staff' && (
                              <Badge variant="outline">{t('staff')}</Badge>
                            )}
                            {status === 'member' && (
                              <Badge variant="secondary">{t('member')}</Badge>
                            )}
                            {status === 'inactive' && (
                              <Badge variant="outline" className="text-muted-foreground border-muted">
                                {t('inactive')}
                              </Badge>
                            )}
                            {/* Auto-reserve indicator for card members */}
                            {member.member_type === 'card' && member.auto_reserve_enabled && member.preferred_workout_type && (
                              <Badge variant="outline" className="text-xs py-0.5" title={`Auto-reserve: ${member.preferred_workout_type}`}>
                                {member.preferred_workout_type === 'early' ? (
                                  <Sunrise className="h-3 w-3 text-amber-500" />
                                ) : (
                                  <Moon className="h-3 w-3 text-indigo-500" />
                                )}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {status === 'inactive' && (
                            <DropdownMenuItem onClick={() => handleActivateMember(member)}>
                              <UserPlus className="h-4 w-4 mr-2" />
                              {t('activate')}
                            </DropdownMenuItem>
                          )}
                          {status === 'member' && (
                            <>
                              <DropdownMenuItem onClick={() => handlePromoteToCard(member)}>
                                <ArrowUp className="h-4 w-4 mr-2" />
                                {t('promoteToCard')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDeactivateMember(member)}>
                                <UserX className="h-4 w-4 mr-2" />
                                {t('deactivate')}
                              </DropdownMenuItem>
                            </>
                          )}
                          {status === 'card' && (
                            <>
                              <DropdownMenuItem onClick={() => handleDemoteToMember(member)}>
                                <ArrowDown className="h-4 w-4 mr-2" />
                                {t('demoteToMember')}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDeactivateMember(member)}>
                                <UserX className="h-4 w-4 mr-2" />
                                {t('deactivate')}
                              </DropdownMenuItem>
                            </>
                          )}
                          {status === 'staff' && (
                            <DropdownMenuItem onClick={() => handleRemoveStaff(member)}>
                              <UserMinus className="h-4 w-4 mr-2" />
                              {t('removeStaff')}
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem 
                            onClick={() => handleRemoveMember(member)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {t('removeMember')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {/* Pending Approvals Tab (Admin only) */}
          {isAdmin && (
            <TabsContent value="approvals" className="space-y-4">
              <h2 className="font-display text-xl font-medium">{t('pendingApprovals')}</h2>
              {pendingApprovals.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No pending approvals</p>
              ) : (
                <div className="grid gap-3">
                  {pendingApprovals.map((approval) => (
                    <Card key={approval.id} className="border-border/50">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div>
                          <p className="font-medium">{approval.full_name || 'Unknown'}</p>
                          <p className="text-sm text-muted-foreground">{approval.email}</p>
                          <p className="text-xs text-muted-foreground">
                            Requested: {format(parseISO(approval.requested_at), 'MMM d, yyyy HH:mm')}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleApproveStaff(approval)}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            {t('approveStaff')}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>

        {/* Attendance Dialog */}
        <Dialog open={!!selectedWorkout} onOpenChange={() => setSelectedWorkout(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-display">
                {t('markAttendance')} - {selectedWorkout?.title}
              </DialogTitle>
            </DialogHeader>
            <div className="py-2 text-sm text-muted-foreground flex items-center justify-between">
              <span>
                {t('reservationsMade')}: <span className="font-medium text-foreground">{workoutReservations.length}</span>
              </span>
              {selectedWorkout && (
                <span>
                  {t('maxSpots')}: <span className="font-medium text-foreground">{selectedWorkout.max_spots}</span>
                </span>
              )}
            </div>

            {workoutReservations.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No reservations</p>
            ) : (
              <ScrollArea className="max-h-[60vh] pr-3">
                <div className="space-y-3 py-2">
                  {workoutReservations.map((res) => (
                    <div key={res.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-medium">{res.profiles?.full_name || 'Member'}</p>
                          <div className="flex items-center gap-1 flex-wrap">
                            {res.profiles?.member_type === 'card' && (
                              <Badge className="bg-primary/20 text-xs">
                                <Crown className="h-3 w-3 mr-1" />
                                Card
                              </Badge>
                            )}
                            {/* Auto-reserve indicator */}
                            {res.profiles?.member_type === 'card' && res.profiles?.auto_reserve_enabled && res.profiles?.preferred_workout_type && (
                              <Badge variant="outline" className="text-xs py-0" title={`Auto-reserve: ${res.profiles.preferred_workout_type}`}>
                                {res.profiles.preferred_workout_type === 'early' ? (
                                  <Sunrise className="h-3 w-3 text-amber-500" />
                                ) : (
                                  <Moon className="h-3 w-3 text-indigo-500" />
                                )}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant={workoutAttendance[res.user_id] === true ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => handleMarkAttendance(selectedWorkout!.id, res.user_id, true)}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          variant={workoutAttendance[res.user_id] === false ? 'destructive' : 'outline'}
                          size="sm"
                          onClick={() => handleMarkAttendance(selectedWorkout!.id, res.user_id, false)}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </DialogContent>
        </Dialog>

        {/* Member Details Dialog */}
        <Dialog
          open={!!selectedMember}
          onOpenChange={(open) => {
            if (!open) setSelectedMember(null);
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-display">{t('memberDetails')}</DialogTitle>
            </DialogHeader>

            {selectedMember && (
              <div className="space-y-4 py-2">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-medium text-foreground">{selectedMember.full_name || 'Member'}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {selectedMember.member_type === 'card' && (
                        <Badge className="bg-primary/20">
                          <Crown className="h-3 w-3 mr-1" />
                          {t('cardMember')}
                        </Badge>
                      )}
                      {selectedMember.roles.some(
                        (r) => (r.role === 'staff' || r.role === 'admin') && r.is_approved
                      ) && <Badge variant="outline">{t('staff')}</Badge>}
                    </div>
                  </div>

                  {selectedMember.member_type === 'card' && (
                    <div className="relative">
                      {selectedMember.card_image_url ? (
                        <img
                          src={selectedMember.card_image_url}
                          alt={`Card membership photo for ${selectedMember.full_name || 'member'}`}
                          className="h-20 w-20 rounded-md object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-20 w-20 rounded-md bg-muted flex items-center justify-center">
                          <Camera className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <label className="absolute -bottom-2 -right-2 cursor-pointer">
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUpdateCardImage(selectedMember, file);
                          }}
                          disabled={uploadingCardImage}
                        />
                        <div className="rounded-full bg-primary p-1.5 text-primary-foreground hover:bg-primary/90 transition-colors">
                          {uploadingCardImage ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Edit className="h-3.5 w-3.5" />
                          )}
                        </div>
                      </label>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border/60 bg-card p-4">
                  <dl className="grid grid-cols-1 gap-3">
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-sm text-muted-foreground">{t('email')}</dt>
                      <dd className="text-sm text-foreground truncate">{selectedMember.email || '-'}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-sm text-muted-foreground">{t('phone')}</dt>
                      <dd className="text-sm text-foreground truncate">{selectedMember.phone || '-'}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Manage Members Dialog */}
        <Dialog open={!!manageMembersWorkout} onOpenChange={() => setManageMembersWorkout(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="font-display">
                {language === 'bg' ? 'Управление на членове' : 'Manage Members'} - {manageMembersWorkout?.title}
              </DialogTitle>
            </DialogHeader>
            <div className="py-2 text-sm text-muted-foreground">
              {language === 'bg' ? 'Записани' : 'Enrolled'}: <span className="font-medium text-foreground">{manageMembersReservations.length}</span>
              {manageMembersWorkout && (
                <> / {manageMembersWorkout.max_spots} {language === 'bg' ? 'места' : 'spots'}</>
              )}
            </div>

            <div className="flex-1 overflow-hidden flex flex-col gap-4">
              {/* Members in workout */}
              <div className="flex-1 overflow-hidden">
                <h4 className="text-sm font-medium mb-2">{language === 'bg' ? 'В тренировката' : 'In Workout'}</h4>
                <ScrollArea className="h-[200px] pr-3">
                  {manageMembersReservations.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4 text-sm">
                      {language === 'bg' ? 'Няма записани членове' : 'No members enrolled'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {manageMembersReservations.map((res) => (
                        <div key={res.id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/50">
                          <div className="flex items-center gap-2">
                            {res.profiles?.card_image_url && (
                              <img
                                src={res.profiles.card_image_url}
                                alt=""
                                className="h-8 w-8 rounded object-cover"
                              />
                            )}
                            <div>
                              <p className="text-sm font-medium">{res.profiles?.full_name || 'Member'}</p>
                              <div className="flex items-center gap-1 flex-wrap">
                                {res.profiles?.member_type === 'card' && (
                                  <Badge className="bg-primary/20 text-xs py-0">
                                    <Crown className="h-2.5 w-2.5 mr-1" />
                                    Card
                                  </Badge>
                                )}
                                {/* Auto-reserve indicator */}
                                {res.profiles?.member_type === 'card' && res.profiles?.auto_reserve_enabled && res.profiles?.preferred_workout_type && (
                                  <Badge variant="outline" className="text-xs py-0" title={`Auto-reserve: ${res.profiles.preferred_workout_type}`}>
                                    {res.profiles.preferred_workout_type === 'early' ? (
                                      <Sunrise className="h-2.5 w-2.5 text-amber-500" />
                                    ) : (
                                      <Moon className="h-2.5 w-2.5 text-indigo-500" />
                                    )}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => manageMembersWorkout && handleRemoveMemberFromWorkout(manageMembersWorkout.id, res.user_id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>

              {/* Waiting List Section */}
              {manageMembersWaitingList.length > 0 && (
                <>
                  <Separator />
                  <div className="overflow-hidden">
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-500" />
                      {language === 'bg' ? 'Лист за чакане' : 'Waiting List'}
                      <Badge variant="secondary" className="text-xs">{manageMembersWaitingList.length}</Badge>
                    </h4>
                    <ScrollArea className="h-[150px] pr-3">
                      <div className="space-y-2">
                        {manageMembersWaitingList.map((entry) => (
                          <div key={entry.id} className="flex items-center justify-between p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-medium text-amber-600">
                                {entry.position}
                              </div>
                              {entry.profiles?.card_image_url && (
                                <img
                                  src={entry.profiles.card_image_url}
                                  alt=""
                                  className="h-8 w-8 rounded object-cover"
                                />
                              )}
                              <div>
                                <p className="text-sm font-medium">{entry.profiles?.full_name || 'Member'}</p>
                                <div className="flex items-center gap-1 flex-wrap">
                                  {entry.profiles?.member_type === 'card' && (
                                    <Badge className="bg-primary/20 text-xs py-0">
                                      <Crown className="h-2.5 w-2.5 mr-1" />
                                      Card
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (manageMembersWorkout) {
                                  handleAddMemberToWorkout(manageMembersWorkout.id, entry.user_id);
                                  // Also remove from waiting list
                                  supabase
                                    .from('waiting_list')
                                    .update({ is_active: false })
                                    .eq('id', entry.id)
                                    .then(() => fetchManageMembersReservations(manageMembersWorkout.id));
                                }
                              }}
                              className="text-primary hover:text-primary"
                              title={language === 'bg' ? 'Добави в тренировката' : 'Add to workout'}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </>
              )}

              <Separator />

              {/* Available members to add */}
              <div className="flex-1 overflow-hidden">
                <h4 className="text-sm font-medium mb-2">{language === 'bg' ? 'Добави член' : 'Add Member'}</h4>
                <ScrollArea className="h-[200px] pr-3">
                  {(() => {
                    const enrolledUserIds = new Set(manageMembersReservations.map(r => r.user_id));
                    const waitingUserIds = new Set(manageMembersWaitingList.map(w => w.user_id));
                    const availableMembers = members.filter(m => {
                      const status = getMemberStatus(m);
                      return (status === 'member' || status === 'card') && !enrolledUserIds.has(m.user_id) && !waitingUserIds.has(m.user_id);
                    });

                    if (availableMembers.length === 0) {
                      return (
                        <p className="text-center text-muted-foreground py-4 text-sm">
                          {language === 'bg' ? 'Няма налични членове' : 'No available members'}
                        </p>
                      );
                    }

                    return (
                      <div className="space-y-2">
                        {availableMembers.map((member) => (
                          <div key={member.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2">
                              {member.card_image_url && (
                                <img
                                  src={member.card_image_url}
                                  alt=""
                                  className="h-8 w-8 rounded object-cover"
                                />
                              )}
                              <div>
                                <p className="text-sm font-medium">{member.full_name || 'Member'}</p>
                                <div className="flex items-center gap-1 flex-wrap">
                                  {member.member_type === 'card' && (
                                    <Badge className="bg-primary/20 text-xs py-0">
                                      <Crown className="h-2.5 w-2.5 mr-1" />
                                      Card
                                    </Badge>
                                  )}
                                  {/* Auto-reserve indicator */}
                                  {member.member_type === 'card' && member.auto_reserve_enabled && member.preferred_workout_type && (
                                    <Badge variant="outline" className="text-xs py-0" title={`Auto-reserve: ${member.preferred_workout_type}`}>
                                      {member.preferred_workout_type === 'early' ? (
                                        <Sunrise className="h-2.5 w-2.5 text-amber-500" />
                                      ) : (
                                        <Moon className="h-2.5 w-2.5 text-indigo-500" />
                                      )}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => manageMembersWorkout && handleAddMemberToWorkout(manageMembersWorkout.id, member.user_id)}
                              className="text-primary hover:text-primary"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </ScrollArea>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
