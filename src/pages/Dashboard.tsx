import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Logo } from '@/components/Logo';
import { LanguageSelector } from '@/components/LanguageSelector';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Clock, Users, ChevronLeft, ChevronRight, LogOut, Settings, Crown, Lock } from 'lucide-react';
import { format, addDays, startOfWeek, isSameDay, parseISO, getDay, getMonth, differenceInHours } from 'date-fns';
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
  created_by: string;
}

interface Reservation {
  id: string;
  workout_id: string;
  user_id: string;
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
  const [reservationCounts, setReservationCounts] = useState<Record<string, number>>({});
  const [loadingWorkout, setLoadingWorkout] = useState<string | null>(null);

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
  }, [selectedDate]);

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
      
      // Fetch reservation counts
      const counts: Record<string, number> = {};
      for (const workout of data) {
        const { count } = await supabase
          .from('reservations')
          .select('*', { count: 'exact', head: true })
          .eq('workout_id', workout.id)
          .eq('is_active', true);
        counts[workout.id] = count || 0;
      }
      setReservationCounts(counts);
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

  // Check if reservations are open for a workout
  const getReservationStatus = (workout: Workout) => {
    const workoutDateTime = new Date(`${workout.workout_date}T${workout.start_time}`);
    const now = new Date();
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
    
    if (status === 'not_open') return false;
    if (status === 'priority' && !isCardMember) return false;
    
    return true;
  };

  const handleReserve = async (workoutId: string) => {
    if (!user) return;
    
    setLoadingWorkout(workoutId);
    
    const { error } = await supabase
      .from('reservations')
      .insert({
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
      toast({ title: t('reservationSuccess') });
      fetchReservations();
      fetchWorkouts();
    }
    
    setLoadingWorkout(null);
  };

  const handleCancelReservation = async (workoutId: string) => {
    if (!user) return;
    
    setLoadingWorkout(workoutId);
    
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
      toast({ title: t('reservationCancelled') });
      fetchReservations();
      fetchWorkouts();
    }
    
    setLoadingWorkout(null);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const getWorkoutTitle = (workout: Workout) => {
    return language === 'bg' && workout.title_bg ? workout.title_bg : workout.title;
  };

  const getWorkoutDescription = (workout: Workout) => {
    return language === 'bg' && workout.description_bg ? workout.description_bg : workout.description;
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
          
          <div className="flex items-center gap-3">
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
                  
                  return (
                    <motion.div
                      key={workout.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Card className="overflow-hidden border-border/50 shadow-sm hover:shadow-elegant transition-shadow">
                        <CardContent className="p-4 sm:p-6">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-display text-xl font-semibold">
                                  {getWorkoutTitle(workout)}
                                </h4>
                                {workout.card_priority_enabled && reservationStatus.status === 'priority' && (
                                  <Badge variant="secondary" className="bg-primary/20">
                                    <Crown className="h-3 w-3 mr-1" />
                                    {t('cardPriorityPeriod')}
                                  </Badge>
                                )}
                                {reservationStatus.status === 'not_open' && (
                                  <Badge variant="outline">
                                    <Lock className="h-3 w-3 mr-1" />
                                    {t('reservationNotOpen')}
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
                              </div>
                            </div>
                            
                            <div className="flex-shrink-0">
                              {isStaff ? (
                                <Badge variant="outline">{t('staff')}</Badge>
                              ) : reserved ? (
                                <Button
                                  variant="outline"
                                  onClick={() => handleCancelReservation(workout.id)}
                                  disabled={loadingWorkout === workout.id}
                                  className="w-full sm:w-auto"
                                >
                                  {loadingWorkout === workout.id ? t('loading') : t('cancelReservation')}
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
                                          ? t('reservationNotOpen')
                                          : t('reserve')
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
