-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'staff', 'card_member', 'member');

-- Create enum for member type
CREATE TYPE public.member_type AS ENUM ('regular', 'card');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  member_type member_type NOT NULL DEFAULT 'regular',
  card_image_url TEXT,
  preferred_language TEXT DEFAULT 'en',
  is_regular_attendee BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create user_roles table (separate for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'member',
  is_approved BOOLEAN DEFAULT false,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create workouts table
CREATE TABLE public.workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  title_bg TEXT,
  description TEXT,
  description_bg TEXT,
  workout_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  max_spots INTEGER NOT NULL DEFAULT 10,
  card_priority_enabled BOOLEAN DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on workouts
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;

-- Create reservations table
CREATE TABLE public.reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID REFERENCES public.workouts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  reserved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(workout_id, user_id)
);

-- Enable RLS on reservations
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

-- Create attendance table
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id UUID REFERENCES public.workouts(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  attended BOOLEAN DEFAULT false,
  marked_by UUID NOT NULL,
  marked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(workout_id, user_id)
);

-- Enable RLS on attendance
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- Create pending_staff_approvals table for tracking staff signup requests
CREATE TABLE public.pending_staff_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email TEXT NOT NULL,
  full_name TEXT,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  approval_token UUID DEFAULT gen_random_uuid(),
  is_processed BOOLEAN DEFAULT false
);

-- Enable RLS
ALTER TABLE public.pending_staff_approvals ENABLE ROW LEVEL SECURITY;

-- Create notification_queue table
CREATE TABLE public.notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workout_id UUID REFERENCES public.workouts(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  message TEXT NOT NULL,
  message_bg TEXT,
  is_sent BOOLEAN DEFAULT false,
  scheduled_for TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

-- Security definer function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND is_approved = true
  )
$$;

-- Function to check if user is staff or admin
CREATE OR REPLACE FUNCTION public.is_staff_or_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('staff', 'admin')
      AND is_approved = true
  )
$$;

-- Function to get user's member type
CREATE OR REPLACE FUNCTION public.get_member_type(_user_id UUID)
RETURNS member_type
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT member_type FROM public.profiles WHERE user_id = _user_id
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Staff can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own role on signup"
  ON public.user_roles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for workouts
CREATE POLICY "Anyone can view workouts"
  ON public.workouts FOR SELECT
  USING (true);

CREATE POLICY "Staff can insert workouts"
  ON public.workouts FOR INSERT
  WITH CHECK (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff can update workouts"
  ON public.workouts FOR UPDATE
  USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff can delete workouts"
  ON public.workouts FOR DELETE
  USING (public.is_staff_or_admin(auth.uid()));

-- RLS Policies for reservations
CREATE POLICY "Users can view own reservations"
  ON public.reservations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Staff can view all reservations"
  ON public.reservations FOR SELECT
  USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Authenticated users can create reservations"
  ON public.reservations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can cancel own reservations"
  ON public.reservations FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for attendance
CREATE POLICY "Users can view own attendance"
  ON public.attendance FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Staff can view all attendance"
  ON public.attendance FOR SELECT
  USING (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff can manage attendance"
  ON public.attendance FOR INSERT
  WITH CHECK (public.is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff can update attendance"
  ON public.attendance FOR UPDATE
  USING (public.is_staff_or_admin(auth.uid()));

-- RLS for pending_staff_approvals
CREATE POLICY "Admins can view pending approvals"
  ON public.pending_staff_approvals FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own approval request"
  ON public.pending_staff_approvals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update approvals"
  ON public.pending_staff_approvals FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS for notification_queue
CREATE POLICY "Users can view own notifications"
  ON public.notification_queue FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Staff can manage notifications"
  ON public.notification_queue FOR ALL
  USING (public.is_staff_or_admin(auth.uid()));

-- Trigger for profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name, member_type)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE((NEW.raw_user_meta_data ->> 'member_type')::member_type, 'regular')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workouts_updated_at
  BEFORE UPDATE ON public.workouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();