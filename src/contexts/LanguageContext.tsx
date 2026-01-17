import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'bg';

interface Translations {
  [key: string]: {
    en: string;
    bg: string;
  };
}

const translations: Translations = {
  // General
  appName: { en: 'NZ Sport Club', bg: 'NZ Спорт Клуб' },
  welcome: { en: 'Welcome', bg: 'Добре дошли' },
  loading: { en: 'Loading...', bg: 'Зареждане...' },
  save: { en: 'Save', bg: 'Запази' },
  cancel: { en: 'Cancel', bg: 'Отказ' },
  delete: { en: 'Delete', bg: 'Изтрий' },
  edit: { en: 'Edit', bg: 'Редактирай' },
  confirm: { en: 'Confirm', bg: 'Потвърди' },
  back: { en: 'Back', bg: 'Назад' },
  
  // Auth
  signIn: { en: 'Sign In', bg: 'Вход' },
  signUp: { en: 'Sign Up', bg: 'Регистрация' },
  signOut: { en: 'Sign Out', bg: 'Изход' },
  email: { en: 'Email', bg: 'Имейл' },
  password: { en: 'Password', bg: 'Парола' },
  confirmPassword: { en: 'Confirm Password', bg: 'Потвърди парола' },
  fullName: { en: 'Full Name', bg: 'Пълно име' },
  phone: { en: 'Phone', bg: 'Телефон' },
  rememberMe: { en: 'Remember me', bg: 'Запомни ме' },
  forgotPassword: { en: 'Forgot password?', bg: 'Забравена парола?' },
  resetPassword: { en: 'Reset Password', bg: 'Нулиране на парола' },
  resetPasswordSent: { en: 'Password reset email sent! Check your inbox.', bg: 'Имейлът за нулиране на паролата е изпратен! Проверете пощата си.' },
  sendResetLink: { en: 'Send Reset Link', bg: 'Изпрати линк за нулиране' },
  backToLogin: { en: 'Back to Login', bg: 'Обратно към вход' },
  updatePassword: { en: 'Update Password', bg: 'Актуализирай парола' },
  newPassword: { en: 'New Password', bg: 'Нова парола' },
  enterNewPassword: { en: 'Enter your new password', bg: 'Въведете новата си парола' },
  passwordUpdated: { en: 'Password updated successfully!', bg: 'Паролата е актуализирана успешно!' },
  enterEmailForReset: { en: 'Enter your email to receive a reset link', bg: 'Въведете имейла си, за да получите линк за нулиране' },
  invalidEmail: { en: 'Please enter a valid email address', bg: 'Моля, въведете валиден имейл адрес' },
  
  // Member types
  member: { en: 'Member', bg: 'Член' },
  cardMember: { en: 'Card Member', bg: 'Картов член' },
  staff: { en: 'Staff', bg: 'Персонал' },
  admin: { en: 'Admin', bg: 'Администратор' },
  inactive: { en: 'Inactive', bg: 'Неактивен' },
  
  // Schedule
  schedule: { en: 'Schedule', bg: 'Разписание' },
  today: { en: 'Today', bg: 'Днес' },
  tomorrow: { en: 'Tomorrow', bg: 'Утре' },
  thisWeek: { en: 'This Week', bg: 'Тази седмица' },
  noWorkouts: { en: 'No workouts scheduled', bg: 'Няма планирани тренировки' },
  
  // Workouts
  workout: { en: 'Workout', bg: 'Тренировка' },
  workouts: { en: 'Workouts', bg: 'Тренировки' },
  createWorkout: { en: 'Create Workout', bg: 'Създай тренировка' },
  editWorkout: { en: 'Edit Workout', bg: 'Редактирай тренировка' },
  workoutTitle: { en: 'Workout Title', bg: 'Заглавие на тренировка' },
  description: { en: 'Description', bg: 'Описание' },
  date: { en: 'Date', bg: 'Дата' },
  startTime: { en: 'Start Time', bg: 'Начален час' },
  endTime: { en: 'End Time', bg: 'Краен час' },
  maxSpots: { en: 'Max Spots', bg: 'Макс. места' },
  availableSpots: { en: 'Available Spots', bg: 'Свободни места' },
  cardPriority: { en: 'Card Member Priority', bg: 'Приоритет за картови членове' },
  bookingOpensHours: { en: 'Booking opens (hours before)', bg: 'Записване се отваря (часове преди)' },
  bookingNotOpen: { en: 'Booking not open yet', bg: 'Записването още не е отворено' },
  cardPriorityPeriod: { en: 'Card member priority period', bg: 'Период за приоритет на картови членове' },
  
  // Reservations
  book: { en: 'Book Spot', bg: 'Запиши се' },
  cancelBooking: { en: 'Cancel Booking', bg: 'Откажи записване' },
  booked: { en: 'Booked', bg: 'Записан' },
  spotsFull: { en: 'Spots Full', bg: 'Няма места' },
  priorityPeriod: { en: 'Card members priority booking', bg: 'Приоритетно записване за картови членове' },
  
  // Attendance
  attendance: { en: 'Attendance', bg: 'Посещаемост' },
  markAttendance: { en: 'Mark Attendance', bg: 'Отбележи присъствие' },
  bookingsMade: { en: 'Bookings', bg: 'Записвания' },
  attended: { en: 'Attended', bg: 'Присъствал' },
  absent: { en: 'Absent', bg: 'Отсъствал' },
  regularAttendee: { en: 'Regular', bg: 'Редовен' },
  
  // Staff
  staffDashboard: { en: 'Staff Dashboard', bg: 'Табло за персонал' },
  manageWorkouts: { en: 'Manage Workouts', bg: 'Управление на тренировки' },
  manageMembers: { en: 'Manage Members', bg: 'Управление на членове' },
  memberDetails: { en: 'Member Details', bg: 'Детайли за член' },
  viewBookings: { en: 'View Bookings', bg: 'Преглед на записвания' },
  pendingApprovals: { en: 'Pending Approvals', bg: 'Чакащи одобрения' },
  
  // Admin
  adminDashboard: { en: 'Admin Dashboard', bg: 'Административно табло' },
  approveStaff: { en: 'Approve Staff', bg: 'Одобри персонал' },
  removeMember: { en: 'Remove Member', bg: 'Премахни член' },
  
  // Member management
  promoteToCard: { en: 'Promote to Card Member', bg: 'Повиши до картов член' },
  demoteToMember: { en: 'Demote to Member', bg: 'Понижи до член' },
  deactivate: { en: 'Deactivate', bg: 'Деактивирай' },
  activate: { en: 'Activate', bg: 'Активирай' },
  removeStaff: { en: 'Remove Staff', bg: 'Премахни персонал' },
  
  // Notifications
  notifications: { en: 'Notifications', bg: 'Известия' },
  spotFreed: { en: 'A spot has been freed!', bg: 'Освободи се място!' },
  
  // Workout types
  workoutType: { en: 'Workout Type', bg: 'Тип тренировка' },
  early: { en: 'Early', bg: 'Ранна' },
  late: { en: 'Late', bg: 'Късна' },
  preferredWorkoutType: { en: 'Preferred Workout Type', bg: 'Предпочитан тип тренировка' },
  autoBookFor: { en: 'Auto-book for', bg: 'Авто-записване за' },
  
  // Waiting list
  joinWaitingList: { en: 'Join Waiting List', bg: 'Запиши се в листа за чакане' },
  leaveWaitingList: { en: 'Leave Waiting List', bg: 'Напусни листа за чакане' },
  waitingList: { en: 'Waiting List', bg: 'Лист за чакане' },
  yourPosition: { en: 'Your position', bg: 'Вашата позиция' },
  workoutPassed: { en: 'Workout has passed', bg: 'Тренировката е приключила' },
  
  // Language
  language: { en: 'Language', bg: 'Език' },
  english: { en: 'English', bg: 'Английски' },
  bulgarian: { en: 'Bulgarian', bg: 'Български' },
  
  // Messages
  signUpSuccess: { en: 'Account created successfully!', bg: 'Акаунтът е създаден успешно!' },
  staffPending: { en: 'Your staff account is pending approval', bg: 'Вашият акаунт за персонал очаква одобрение' },
  bookingSuccess: { en: 'Booking confirmed!', bg: 'Записването е потвърдено!' },
  bookingCancelled: { en: 'Booking cancelled', bg: 'Записването е отменено' },
  alreadyBooked: { en: 'You already have a booking for this workout', bg: 'Вече имате записване за тази тренировка' },
  memberPromoted: { en: 'Member promoted successfully', bg: 'Членът е повишен успешно' },
  memberDemoted: { en: 'Member demoted successfully', bg: 'Членът е понижен успешно' },
  memberRemoved: { en: 'Member removed successfully', bg: 'Членът е премахнат успешно' },
  staffRemoved: { en: 'Staff removed successfully', bg: 'Персоналът е премахнат успешно' },
  
  // Profile editor
  cardPhoto: { en: 'Card Photo', bg: 'Снимка на карта' },
  uploadPhoto: { en: 'Upload Photo', bg: 'Качи снимка' },
  changePhoto: { en: 'Change Photo', bg: 'Смени снимка' },
  cardPhotoDescription: { en: 'Photo of your membership card', bg: 'Снимка на членската ви карта' },
  autoBook: { en: 'Auto-book', bg: 'Авто-записване' },
  editProfile: { en: 'Edit Profile', bg: 'Редактирай профил' },

  // Card member signup
  takeCardPhoto: { en: 'Take a photo of your membership card', bg: 'Направете снимка на членската си карта' },
  cardPhotoHint: { en: 'Position your card clearly in the frame', bg: 'Позиционирайте картата ясно в рамката' },

  // Days
  monday: { en: 'Monday', bg: 'Понеделник' },
  tuesday: { en: 'Tuesday', bg: 'Вторник' },
  wednesday: { en: 'Wednesday', bg: 'Сряда' },
  thursday: { en: 'Thursday', bg: 'Четвъртък' },
  friday: { en: 'Friday', bg: 'Петък' },
  saturday: { en: 'Saturday', bg: 'Събота' },
  sunday: { en: 'Sunday', bg: 'Неделя' },

  // Signup types
  signUpAsMember: { en: 'Sign up as Member', bg: 'Регистрация като член' },
  signUpAsCardMember: { en: 'Sign up as Card Member', bg: 'Регистрация като картов член' },
  signUpAsStaff: { en: 'Sign up as Staff', bg: 'Регистрация като персонал' },
  signUpAsAdmin: { en: 'Request Admin Access', bg: 'Заявка за админ достъп' },
  
  chooseAccountType: { en: 'Choose Account Type', bg: 'Изберете тип акаунт' },
  memberDescription: { en: 'Regular gym member with access to schedule and reservations', bg: 'Обикновен член с достъп до разписание и резервации' },
  cardMemberDescription: { en: 'Premium member with priority booking and early notifications', bg: 'Премиум член с приоритетно записване и ранни известия' },
  staffDescription: { en: 'Gym staff - requires admin approval', bg: 'Персонал на залата - изисква одобрение от админ' },

  // Password requirements
  passwordRequirements: { 
    en: 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number', 
    bg: 'Паролата трябва да е поне 8 символа с 1 главна буква, 1 малка буква и 1 цифра' 
  },
  passwordTooWeak: { en: 'Password does not meet requirements', bg: 'Паролата не отговаря на изискванията' },
  passwordsDoNotMatch: { en: 'Passwords do not match', bg: 'Паролите не съвпадат' },

  // Months
  january: { en: 'January', bg: 'Януари' },
  february: { en: 'February', bg: 'Февруари' },
  march: { en: 'March', bg: 'Март' },
  april: { en: 'April', bg: 'Април' },
  may: { en: 'May', bg: 'Май' },
  june: { en: 'June', bg: 'Юни' },
  july: { en: 'July', bg: 'Юли' },
  august: { en: 'August', bg: 'Август' },
  september: { en: 'September', bg: 'Септември' },
  october: { en: 'October', bg: 'Октомври' },
  november: { en: 'November', bg: 'Ноември' },
  december: { en: 'December', bg: 'Декември' },

  // Short days
  mon: { en: 'Mon', bg: 'Пон' },
  tue: { en: 'Tue', bg: 'Вто' },
  wed: { en: 'Wed', bg: 'Сря' },
  thu: { en: 'Thu', bg: 'Чет' },
  fri: { en: 'Fri', bg: 'Пет' },
  sat: { en: 'Sat', bg: 'Съб' },
  sun: { en: 'Sun', bg: 'Нед' },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('nz-language');
    return (saved as Language) || 'en';
  });

  useEffect(() => {
    localStorage.setItem('nz-language', language);
  }, [language]);

  const t = (key: string): string => {
    const translation = translations[key];
    if (!translation) {
      console.warn(`Missing translation for key: ${key}`);
      return key;
    }
    return translation[language];
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
