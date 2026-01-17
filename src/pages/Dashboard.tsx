import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { sendWorkoutNotification } from '@/lib/sendWorkoutNotification';
import { Logo } from '@/components/Logo';
import { LanguageSelector } from '@/components/LanguageSelector';
import { NotificationSettings } from '@/components/NotificationSettings';
import { MemberProfileEditor } from '@/components/MemberProfileEditor';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Clock, Users, ChevronLeft, ChevronRight, LogOut, Settings, Crown, Lock, Loader2 } from 'lucide-react';
import { format, addDays, startOfWeek, isSameDay, parseISO, getDay, getMonth, differenceInHours, isBefore } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

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

interface Reservation {
  id: string;
  workout_id: string;
  user_id: string;
  is_active: boolean;
}

interface WaitingListEntry {
  id: string;
  workout_id: string;
  user_id: string;
  position: number;
  is_active: boolean;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { user, profile, isStaff, isAdmin, isCardMember, signOut, isLoading } = useAuth();
  const { toast } = useToast();
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [waitingList, setWaitingList] = useState<WaitingListEntry[]>([]);
  const [reservationCounts, setReservationCounts] = useState<Record<string, number>>({});
  const [waitingListCounts, setWaitingListCounts] = useState<Record<string, number>>({});
  const [loadingWorkout, setLoadingWorkout] = useState<string | null>(null);
  const [autoReserveEnabled, setAutoReserveEnabled] = useState(true);
  const [preferredWorkoutType, setPreferredWorkoutType] = useState<'early' | 'late' | null>(null);
  const [savingAutoReserve, setSavingAutoReserve] = useState(false);

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/');
    }
  }, [user, isLoading, navigate]);

  useEffect(() => {
    fetchWorkouts();
    fetchReservations();
    fetchWaitingList();
  }, [selectedDate]);

  // Fetch auto-reserve preference for card members
  useEffect(() => {
    const fetchAutoReservePref = async () => {
      if (!user || !isCardMember) return;
      
      const { data } = await supabase
        .from('profiles')
        .select('auto_reserve_enabled, preferred_workout_type')
        .eq('user_id', user.id)
        .single();
      
      if (data) {
        setAutoReserveEnabled(data.auto_reserve_enabled ?? true);
        setPreferredWorkoutType(data.preferred_workout_type as 'early' | 'late' | null);
      }
    };
    
    fetchAutoReservePref();
  }, [user, isCardMember]);

  const handleToggleAutoReserve = async (enabled: boolean) => {
    if (!user) return;
    
    setSavingAutoReserve(true);
    
    const { error } = await supabase
      .from('profiles')
      .update({ auto_reserve_enabled: enabled })
      .eq('user_id', user.id);
    
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    } else {
      setAutoReserveEnabled(enabled);
      toast({
        title: enabled 
          ? (language === 'bg' ? 'Авто-резервация включена' : 'Auto-reserve enabled')
          : (language === 'bg' ? 'Авто-резервация изключена' : 'Auto-reserve disabled'),
      });
    }
    
    setSavingAutoReserve(false);
  };

  const fetchWorkouts = async () => {
    const startDate = format(weekStart, 'yyyy-MM-dd');
    const endDate = format(addDays(weekStart, 6), 'yyyy-MM-dd');
    
    const { data } = await supabase
      .from('workouts')
      .select('*')
      .gte('workout_date', startDate)
      .lte('workout_date', endDate)
      .order('workout_date')
      .order('start_time');
    
    if (data) {
      setWorkouts(data as Workout[]);
      
      // Fetch reservation counts using RPC (bypasses RLS for consistent counts)
      const counts: Record<string, number> = {};
      await Promise.all(data.map(async (workout) => {
        const { data: countData } = await supabase
          .rpc('get_reservation_count', { p_workout_id: workout.id });
        counts[workout.id] = countData ?? 0;
      }));
      setReservationCounts(counts);
      
      // Check for auto-reserve triggers (only for staff viewing dashboard)
      checkAutoReserve(data as Workout[]);
    }
  };
  
  // Check and trigger auto-reserve for workouts entering priority period
  const checkAutoReserve = async (workoutList: Workout[]) => {
    const now = new Date();
    
    for (const workout of workoutList) {
      // Skip if not card priority or auto-reserve disabled or already executed
      if (!workout.card_priority_enabled || !workout.auto_reserve_enabled || workout.auto_reserve_executed) {
        continue;
      }
      
      const workoutDateTime = new Date(`${workout.workout_date}T${workout.start_time}`);
      const hoursUntilWorkout = differenceInHours(workoutDateTime, now);
      const reservationOpensHours = workout.reservation_opens_hours || 24;
      
      // Check if we just entered the reservation window (priority period starts now)
      if (hoursUntilWorkout <= reservationOpensHours && hoursUntilWorkout > 0) {
        // Trigger auto-reserve
        try {
          console.log('Triggering auto-reserve for workout:', workout.id);
          const { data, error } = await supabase.functions.invoke('auto-reserve-card-members', {
            body: { workoutId: workout.id },
          });
          
          if (!error && data) {
            console.log('Auto-reserve result:', data);
            // Mark as executed
            await supabase
              .from('workouts')
              .update({ auto_reserve_executed: true })
              .eq('id', workout.id);
          }
        } catch (e) {
          console.error('Auto-reserve failed:', e);
        }
      }
    }
  };

  const fetchReservations = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('reservations')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);
    
    if (data) {
      setReservations(data as Reservation[]);
    }
  };

  const fetchWaitingList = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('waiting_list')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);
    
    if (data) {
      setWaitingList(data as WaitingListEntry[]);
    }
    
    // Fetch waiting list counts for all workouts in view
    const startDate = format(weekStart, 'yyyy-MM-dd');
    const endDate = format(addDays(weekStart, 6), 'yyyy-MM-dd');
    
    const { data: workoutsData } = await supabase
      .from('workouts')
      .select('id')
      .gte('workout_date', startDate)
      .lte('workout_date', endDate);
    
    if (workoutsData) {
      const counts: Record<string, number> = {};
      for (const workout of workoutsData) {
        const { count } = await supabase
          .from('waiting_list')
          .select('*', { count: 'exact', head: true })
          .eq('workout_id', workout.id)
          .eq('is_active', true);
        counts[workout.id] = count || 0;
      }
      setWaitingListCounts(counts);
    }
  };

  // Check if workout has passed
  const isWorkoutPassed = (workout: Workout) => {
    const workoutEndDateTime = new Date(`${workout.workout_date}T${workout.end_time}`);
    return isBefore(workoutEndDateTime, new Date());
  };

  // Check if reservations are open for a workout
  const getReservationStatus = (workout: Workout) => {
    const workoutDateTime = new Date(`${workout.workout_date}T${workout.start_time}`);
    const now = new Date();
    
    // Check if workout has passed
    if (isWorkoutPassed(workout)) {
      return { status: 'passed', hoursUntil: 0 };
    }
    
    const hoursUntilWorkout = differenceInHours(workoutDateTime, now);
    const reservationOpensHours = workout.reservation_opens_hours || 24;
    const priorityPeriodHours = reservationOpensHours / 2;
    
    // Reservations not open yet
    if (hoursUntilWorkout > reservationOpensHours) {
      return { status: 'not_open', hoursUntil: hoursUntilWorkout - reservationOpensHours };
    }
    
    // Card member priority period (first half of reservation window)
    if (workout.card_priority_enabled && hoursUntilWorkout > reservationOpensHours - priorityPeriodHours) {
      return { status: 'priority', hoursUntil: hoursUntilWorkout - (reservationOpensHours - priorityPeriodHours) };
    }
    
    // Open for all
    return { status: 'open', hoursUntil: 0 };
  };

  const canReserve = (workout: Workout) => {
    // Staff cannot reserve
    if (isStaff) return false;
    
    const { status } = getReservationStatus(workout);
    
    if (status === 'passed') return false;
    if (status === 'not_open') return false;
    if (status === 'priority' && !isCardMember) return false;
    
    return true;
  };

  // Check if user can join waiting list
  const canJoinWaitingList = (workout: Workout) => {
    if (isStaff) return false;
    if (isWorkoutPassed(workout)) return false;
    
    const available = getAvailableSpots(workout);
    if (available > 0) return false; // Can still reserve, no need for waiting list
    
    const alreadyOnList = waitingList.some(w => w.workout_id === workout.id);
    if (alreadyOnList) return false;
    
    const alreadyReserved = reservations.some(r => r.workout_id === workout.id);
    if (alreadyReserved) return false;
    
    return true;
  };

  const getUserWaitingPosition = (workoutId: string) => {
    const entry = waitingList.find(w => w.workout_id === workoutId);
    return entry?.position || null;
  };

  const handleJoinWaitingList = async (workoutId: string) => {
    if (!user) return;
    
    setLoadingWorkout(workoutId);
    
    // Get next position
    const { data: positionData } = await supabase
      .rpc('get_next_waiting_list_position', { p_workout_id: workoutId });
    
    const position = positionData || 1;
    
    const { error } = await supabase
      .from('waiting_list')
      .insert({
        workout_id: workoutId,
        user_id: user.id,
        position,
        is_active: true,
      });
    
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    } else {
      toast({ title: t('joinWaitingList') });
      fetchWaitingList();
    }
    
    setLoadingWorkout(null);
  };

  const handleLeaveWaitingList = async (workoutId: string) => {
    if (!user) return;
    
    setLoadingWorkout(workoutId);
    
    const { error } = await supabase
      .from('waiting_list')
      .update({ is_active: false })
      .eq('workout_id', workoutId)
      .eq('user_id', user.id);
    
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    } else {
      toast({ title: t('leaveWaitingList') });
      fetchWaitingList();
    }
    
    setLoadingWorkout(null);
  };

  const handleTogglePreferredType = async (type: 'early' | 'late' | null) => {
    if (!user) return;
    
    setSavingAutoReserve(true);
    
    const { error } = await supabase
      .from('profiles')
      .update({ preferred_workout_type: type })
      .eq('user_id', user.id);
    
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    } else {
      setPreferredWorkoutType(type);
    }
    
    setSavingAutoReserve(false);
  };

  const handleReserve = async (workoutId: string) => {
    if (!user) return;

    setLoadingWorkout(workoutId);

    // If a reservation exists (even cancelled), re-activate it instead of inserting a new row.
    const { data: existingReservation, error: existingError } = await supabase
      .from('reservations')
      .select('id, is_active')
      .eq('workout_id', workoutId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingError) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: existingError.message,
      });
      setLoadingWorkout(null);
      return;
    }

    if (existingReservation?.id) {
      if (existingReservation.is_active) {
        toast({ title: t('alreadyBooked') });
      } else {
        const { error: reactivateError } = await supabase
          .from('reservations')
          .update({ is_active: true, cancelled_at: null, reserved_at: new Date().toISOString() })
          .eq('id', existingReservation.id);

        if (reactivateError) {
          toast({
            variant: 'destructive',
            title: 'Error',
            description: reactivateError.message,
          });
        } else {
          toast({ title: t('bookingSuccess') });
          fetchReservations();
          fetchWorkouts();
        }
      }

      setLoadingWorkout(null);
      return;
    }

    const { error } = await supabase.from('reservations').insert({
      workout_id: workoutId,
      user_id: user.id,
    });

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    } else {
      toast({ title: t('bookingSuccess') });
      fetchReservations();
      fetchWorkouts();
      
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

    setLoadingWorkout(null);
  };

  const handleCancelReservation = async (workoutId: string) => {
    if (!user) return;
    
    setLoadingWorkout(workoutId);
    
    // Get workout details for notification
    const workout = workouts.find(w => w.id === workoutId);
    
    const { error } = await supabase
      .from('reservations')
      .update({ is_active: false, cancelled_at: new Date().toISOString() })
      .eq('workout_id', workoutId)
      .eq('user_id', user.id);
    
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    } else {
      toast({ title: t('bookingCancelled') });
      fetchReservations();
      fetchWorkouts();
      
      // Automatically promote from waiting list
      if (workout) {
        try {
          const { data: promotedUserId, error: promoteError } = await supabase
            .rpc('promote_from_waiting_list', { p_workout_id: workoutId });
          
          if (promotedUserId && !promoteError) {
            console.log('Promoted user from waiting list:', promotedUserId);
            
            // Notify the promoted user
            await sendWorkoutNotification({
              type: 'waiting_list_promoted',
              workoutId: workout.id,
              workoutTitle: workout.title,
              workoutTitleBg: workout.title_bg,
              targetUserIds: [promotedUserId],
            });
          } else {
            // No one on waiting list, send spot freed notification
            await sendWorkoutNotification({
              type: 'spot_freed',
              workoutId: workout.id,
              workoutTitle: workout.title,
              workoutTitleBg: workout.title_bg,
              excludeUserIds: [user.id],
            });
          }
        } catch (e) {
          console.log('Waiting list promotion or notification failed:', e);
        }
      }
    }
    
    setLoadingWorkout(null);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  // Unified title - show the same title to all users
  const getWorkoutTitle = (workout: Workout) => {
    // Title should be the same in both languages now (unified), but fallback to title_bg if different
    return workout.title;
  };

  // Unified description - show the same description to all users
  const getWorkoutDescription = (workout: Workout) => {
    return workout.description;
  };

  // Bulgarian translations for days and months
  const shortDayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const fullDayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const monthKeys = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

  const formatDayShort = (date: Date) => {
    if (language === 'bg') {
      return t(shortDayKeys[getDay(date)]);
    }
    return format(date, 'EEE');
  };

  const formatFullDate = (date: Date) => {
    if (language === 'bg') {
      const dayName = t(fullDayKeys[getDay(date)]);
      const monthName = t(monthKeys[getMonth(date)]);
      const dayNum = format(date, 'd');
      return `${dayName}, ${dayNum} ${monthName}`;
    }
    return format(date, 'EEEE, MMMM d');
  };

  const formatWeekRange = (start: Date, end: Date) => {
    if (language === 'bg') {
      const startMonth = t(monthKeys[getMonth(start)]);
      const endMonth = t(monthKeys[getMonth(end)]);
      const startDay = format(start, 'd');
      const endDay = format(end, 'd');
      const year = format(end, 'yyyy');
      if (getMonth(start) === getMonth(end)) {
        return `${startDay} - ${endDay} ${startMonth}, ${year}`;
      }
      return `${startDay} ${startMonth} - ${endDay} ${endMonth}, ${year}`;
    }
    return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
  };

  const isReserved = (workoutId: string) => {
    return reservations.some(r => r.workout_id === workoutId);
  };

  const getAvailableSpots = (workout: Workout) => {
    return workout.max_spots - (reservationCounts[workout.id] || 0);
  };

  const dayWorkouts = workouts.filter(w => 
    isSameDay(parseISO(w.workout_date), selectedDate)
  );

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
          <Logo size="sm" />
          
          <div className="flex items-center gap-2">
            <NotificationSettings />
            <MemberProfileEditor />
            <LanguageSelector variant="minimal" />
            
            {(isStaff || isAdmin) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/staff')}
                className="gap-2"
              >
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">{t('staffDashboard')}</span>
              </Button>
            )}
            
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Welcome */}
        <div className="mb-6">
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-foreground">
            {t('welcome')}, {profile?.full_name || user?.email}
          </h1>
          <div className="flex items-center gap-2 mt-1">
            {isCardMember && (
              <Badge variant="secondary" className="bg-primary/20 text-primary-foreground">
                {t('cardMember')}
              </Badge>
            )}
            {isStaff && (
              <Badge variant="outline">{t('staff')}</Badge>
            )}
            {isAdmin && (
              <Badge variant="outline">{t('admin')}</Badge>
            )}
          </div>
        </div>

        {/* Auto-reserve toggle for card members */}
        {isCardMember && (
          <div className="mb-6 p-4 bg-muted/50 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Crown className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium text-sm">
                    {language === 'bg' ? 'Автоматична резервация' : 'Auto-reserve'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {language === 'bg' 
                      ? 'Автоматично резервиране на места за тренировки' 
                      : 'Automatically reserve spots for workouts'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {savingAutoReserve && <Loader2 className="h-4 w-4 animate-spin" />}
                <Switch
                  checked={autoReserveEnabled}
                  onCheckedChange={handleToggleAutoReserve}
                  disabled={savingAutoReserve}
                />
              </div>
            </div>
            
            {/* Workout type preference - only shown when auto-reserve is enabled */}
            {autoReserveEnabled && (
              <div className="pl-8 border-l-2 border-primary/20 space-y-2">
                <p className="text-sm font-medium">
                  {t('autoBookFor')}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={preferredWorkoutType === 'early' ? 'default' : 'outline'}
                    onClick={() => handleTogglePreferredType(preferredWorkoutType === 'early' ? null : 'early')}
                    disabled={savingAutoReserve}
                  >
                    {t('early')}
                  </Button>
                  <Button
                    size="sm"
                    variant={preferredWorkoutType === 'late' ? 'default' : 'outline'}
                    onClick={() => handleTogglePreferredType(preferredWorkoutType === 'late' ? null : 'late')}
                    disabled={savingAutoReserve}
                  >
                    {t('late')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {preferredWorkoutType 
                    ? (language === 'bg' 
                        ? `Авто-резервация само за ${preferredWorkoutType === 'early' ? 'ранни' : 'късни'} тренировки` 
                        : `Auto-reserve only for ${preferredWorkoutType} workouts`)
                    : (language === 'bg' 
                        ? 'Изберете тип тренировка за авто-резервация' 
                        : 'Select a workout type for auto-reserve')
                  }
                </p>
              </div>
            )}
          </div>
        )}

        {/* Week Navigation */}
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedDate(addDays(selectedDate, -7))}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          
          <h2 className="font-display text-lg font-medium">
            {formatWeekRange(weekStart, addDays(weekStart, 6))}
          </h2>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedDate(addDays(selectedDate, 7))}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {/* Day Selector */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-6">
          {weekDays.map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            const isToday = isSameDay(day, new Date());
            const dayWorkoutCount = workouts.filter(w => 
              isSameDay(parseISO(w.workout_date), day)
            ).length;
            
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDate(day)}
                className={`p-2 sm:p-3 rounded-lg text-center transition-all ${
                  isSelected 
                    ? 'bg-primary text-primary-foreground shadow-elegant' 
                    : 'bg-card hover:bg-accent'
                } ${isToday && !isSelected ? 'ring-2 ring-primary/50' : ''}`}
              >
                <div className="text-xs sm:text-sm font-medium">
                  {formatDayShort(day)}
                </div>
                <div className="text-lg sm:text-xl font-display font-semibold">
                  {format(day, 'd')}
                </div>
                {dayWorkoutCount > 0 && (
                  <div className={`text-xs mt-1 ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                    {dayWorkoutCount} {dayWorkoutCount === 1 ? t('workout').toLowerCase() : t('workouts').toLowerCase()}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Workouts List */}
        <div className="space-y-4">
          <h3 className="font-display text-xl font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            {formatFullDate(selectedDate)}
          </h3>
          
          <AnimatePresence mode="wait">
            {dayWorkouts.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-12 text-muted-foreground"
              >
                {t('noWorkouts')}
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid gap-4"
              >
                {dayWorkouts.map((workout, index) => {
                  const available = getAvailableSpots(workout);
                  const reserved = isReserved(workout.id);
                  const isFull = available <= 0;
                  const reservationStatus = getReservationStatus(workout);
                  const canMakeReservation = canReserve(workout);
                  const isPassed = isWorkoutPassed(workout);
                  const isOnWaitingList = waitingList.some(w => w.workout_id === workout.id);
                  const waitingPosition = getUserWaitingPosition(workout.id);
                  const waitingCount = waitingListCounts[workout.id] || 0;
                  
                  return (
                    <motion.div
                      key={workout.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Card className={`overflow-hidden border-border/50 shadow-sm hover:shadow-elegant transition-shadow ${workout.card_priority_enabled ? 'ring-1 ring-primary/30' : ''} ${isPassed ? 'opacity-60' : ''}`}>
                        <CardContent className="p-4 sm:p-6">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                {workout.card_priority_enabled && (
                                  <Crown className="h-5 w-5 text-primary" />
                                )}
                                <h4 className="font-display text-xl font-semibold">
                                  {getWorkoutTitle(workout)}
                                </h4>
                                <Badge variant={workout.workout_type === 'early' ? 'default' : 'secondary'} className="text-xs">
                                  {t(workout.workout_type || 'early')}
                                </Badge>
                                {isPassed && (
                                  <Badge variant="outline" className="text-muted-foreground">
                                    {t('workoutPassed')}
                                  </Badge>
                                )}
                                {!isPassed && workout.card_priority_enabled && reservationStatus.status === 'priority' && (
                                  <Badge variant="secondary" className="bg-primary/20">
                                    <Crown className="h-3 w-3 mr-1" />
                                    {t('cardPriorityPeriod')}
                                  </Badge>
                                )}
                                {!isPassed && reservationStatus.status === 'not_open' && (
                                  <Badge variant="outline">
                                    <Lock className="h-3 w-3 mr-1" />
                                    {t('bookingNotOpen')}
                                  </Badge>
                                )}
                              </div>
                              
                              {getWorkoutDescription(workout) && (
                                <p className="text-sm text-muted-foreground">
                                  {getWorkoutDescription(workout)}
                                </p>
                              )}
                              
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-4 w-4" />
                                  {workout.start_time.slice(0, 5)} - {workout.end_time.slice(0, 5)}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Users className="h-4 w-4" />
                                  {available} / {workout.max_spots} {t('availableSpots').toLowerCase()}
                                </span>
                                {waitingCount > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    ({waitingCount} {t('waitingList').toLowerCase()})
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <div className="flex-shrink-0 flex flex-col gap-2">
                              {isPassed ? (
                                <Badge variant="outline" className="justify-center">{t('workoutPassed')}</Badge>
                              ) : isStaff ? (
                                <Badge variant="outline">{t('staff')}</Badge>
                              ) : reserved ? (
                                <Button
                                  variant="outline"
                                  onClick={() => handleCancelReservation(workout.id)}
                                  disabled={loadingWorkout === workout.id}
                                  className="w-full sm:w-auto"
                                >
                                  {loadingWorkout === workout.id ? t('loading') : t('cancelBooking')}
                                </Button>
                              ) : isOnWaitingList ? (
                                <div className="flex flex-col gap-1">
                                  <Badge variant="secondary" className="justify-center">
                                    {t('yourPosition')}: #{waitingPosition}
                                  </Badge>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleLeaveWaitingList(workout.id)}
                                    disabled={loadingWorkout === workout.id}
                                  >
                                    {loadingWorkout === workout.id ? t('loading') : t('leaveWaitingList')}
                                  </Button>
                                </div>
                              ) : isFull && canJoinWaitingList(workout) ? (
                                <Button
                                  variant="secondary"
                                  onClick={() => handleJoinWaitingList(workout.id)}
                                  disabled={loadingWorkout === workout.id}
                                  className="w-full sm:w-auto"
                                >
                                  {loadingWorkout === workout.id ? t('loading') : t('joinWaitingList')}
                                </Button>
                              ) : (
                                <Button
                                  onClick={() => handleReserve(workout.id)}
                                  disabled={isFull || loadingWorkout === workout.id || !canMakeReservation}
                                  className="w-full sm:w-auto"
                                >
                                  {loadingWorkout === workout.id 
                                    ? t('loading') 
                                    : isFull 
                                      ? t('spotsFull') 
                                      : !canMakeReservation && reservationStatus.status === 'priority'
                                        ? t('cardPriorityPeriod')
                                        : !canMakeReservation
                                          ? t('bookingNotOpen')
                                          : t('book')
                                  }
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
