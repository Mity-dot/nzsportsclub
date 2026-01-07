import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
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
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, Plus, Edit, Trash2, Calendar, Clock, Users, 
  UserCheck, CheckCircle, XCircle, Crown, MoreVertical, ArrowUp, ArrowDown, UserMinus, UserPlus, UserX, Camera, Loader2
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
}

interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  email?: string;
  phone?: string | null;
  member_type: string;
  card_image_url: string | null;
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
    // Fetch profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, user_id, full_name, email, phone, member_type, card_image_url')
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
    
    if (reservations) {
      const userIds = reservations.map(r => r.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, member_type, card_image_url')
        .in('user_id', userIds);
      
      const reservationsWithProfiles = reservations.map(r => ({
        ...r,
        profiles: profiles?.find(p => p.user_id === r.user_id),
      }));
      
      setWorkoutReservations(reservationsWithProfiles as Reservation[]);
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
      
      // Send push notification for new workout
      if (data) {
        try {
          await supabase.functions.invoke('send-push-notification', {
            body: {
              type: 'new_workout',
              workoutId: data.id,
              workoutTitle: data.title,
              workoutTitleBg: data.title_bg,
              workoutDate: data.workout_date,
              workoutTime: data.start_time?.slice(0, 5),
            },
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
        await supabase.functions.invoke('send-push-notification', {
          body: {
            type: 'workout_updated',
            workoutId: editingWorkout.id,
            workoutTitle: workoutForm.title,
            workoutTitleBg: workoutForm.title_bg,
            workoutDate: workoutForm.workout_date,
            workoutTime: workoutForm.start_time?.slice(0, 5),
          },
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
          await supabase.functions.invoke('send-push-notification', {
            body: {
              type: 'workout_deleted',
              workoutId: workoutId,
              workoutTitle: workoutToDelete.title,
              workoutTitleBg: workoutToDelete.title_bg,
            },
          });
        } catch (e) {
          console.log('Push notification failed');
        }
      }
    }
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
    fetchMembers();
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
    fetchMembers();
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
    });
  };

  const openEditWorkout = (workout: Workout) => {
    setEditingWorkout(workout);
    setWorkoutForm({
      title: workout.title,
      title_bg: workout.title_bg || '',
      description: workout.description || '',
      description_bg: workout.description_bg || '',
      workout_date: workout.workout_date,
      start_time: workout.start_time,
      end_time: workout.end_time,
      max_spots: workout.max_spots,
      card_priority_enabled: workout.card_priority_enabled,
      auto_reserve_enabled: workout.auto_reserve_enabled ?? true,
      reservation_opens_hours: workout.reservation_opens_hours || 24,
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
            <div className="flex justify-between items-center">
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
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t('workoutTitle')} (EN)</Label>
                        <Input
                          value={workoutForm.title}
                          onChange={(e) => setWorkoutForm(f => ({ ...f, title: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t('workoutTitle')} (BG)</Label>
                        <Input
                          value={workoutForm.title_bg}
                          onChange={(e) => setWorkoutForm(f => ({ ...f, title_bg: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t('description')} (EN)</Label>
                        <Textarea
                          value={workoutForm.description}
                          onChange={(e) => setWorkoutForm(f => ({ ...f, description: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t('description')} (BG)</Label>
                        <Textarea
                          value={workoutForm.description_bg}
                          onChange={(e) => setWorkoutForm(f => ({ ...f, description_bg: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('date')}</Label>
                      <Input
                        type="date"
                        value={workoutForm.workout_date}
                        onChange={(e) => setWorkoutForm(f => ({ ...f, workout_date: e.target.value }))}
                      />
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
                          {language === 'bg' && workout.title_bg ? workout.title_bg : workout.title}
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
                        {member.card_image_url && (
                          <img
                            src={member.card_image_url}
                            alt={`Membership card photo for ${member.full_name || 'member'}`}
                            className="h-10 w-10 rounded object-cover"
                            loading="lazy"
                          />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
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
                      <div>
                        <p className="font-medium">{res.profiles?.full_name || 'Member'}</p>
                        {res.profiles?.member_type === 'card' && (
                          <Badge className="bg-primary/20 text-xs">
                            <Crown className="h-3 w-3 mr-1" />
                            Card
                          </Badge>
                        )}
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
      </main>
    </div>
  );
}
