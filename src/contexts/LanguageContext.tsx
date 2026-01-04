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
  
  // Member types
  member: { en: 'Member', bg: 'Член' },
  cardMember: { en: 'Card Member', bg: 'Картов член' },
  staff: { en: 'Staff', bg: 'Персонал' },
  admin: { en: 'Admin', bg: 'Администратор' },
  
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
  
  // Reservations
  reserve: { en: 'Reserve Spot', bg: 'Запази място' },
  cancelReservation: { en: 'Cancel Reservation', bg: 'Откажи резервация' },
  reserved: { en: 'Reserved', bg: 'Резервирано' },
  spotsFull: { en: 'Spots Full', bg: 'Няма места' },
  priorityPeriod: { en: 'Card members priority booking', bg: 'Приоритетно записване за картови членове' },
  
  // Attendance
  attendance: { en: 'Attendance', bg: 'Посещаемост' },
  markAttendance: { en: 'Mark Attendance', bg: 'Отбележи присъствие' },
  attended: { en: 'Attended', bg: 'Присъствал' },
  absent: { en: 'Absent', bg: 'Отсъствал' },
  regularAttendee: { en: 'Regular', bg: 'Редовен' },
  
  // Staff
  staffDashboard: { en: 'Staff Dashboard', bg: 'Табло за персонал' },
  manageWorkouts: { en: 'Manage Workouts', bg: 'Управление на тренировки' },
  manageMembers: { en: 'Manage Members', bg: 'Управление на членове' },
  viewReservations: { en: 'View Reservations', bg: 'Преглед на резервации' },
  pendingApprovals: { en: 'Pending Approvals', bg: 'Чакащи одобрения' },
  
  // Admin
  adminDashboard: { en: 'Admin Dashboard', bg: 'Административно табло' },
  approveStaff: { en: 'Approve Staff', bg: 'Одобри персонал' },
  removeMember: { en: 'Remove Member', bg: 'Премахни член' },
  
  // Notifications
  notifications: { en: 'Notifications', bg: 'Известия' },
  spotFreed: { en: 'A spot has been freed!', bg: 'Освободи се място!' },
  
  // Language
  language: { en: 'Language', bg: 'Език' },
  english: { en: 'English', bg: 'Английски' },
  bulgarian: { en: 'Bulgarian', bg: 'Български' },
  
  // Messages
  signUpSuccess: { en: 'Account created successfully!', bg: 'Акаунтът е създаден успешно!' },
  staffPending: { en: 'Your staff account is pending approval', bg: 'Вашият акаунт за персонал очаква одобрение' },
  reservationSuccess: { en: 'Reservation confirmed!', bg: 'Резервацията е потвърдена!' },
  reservationCancelled: { en: 'Reservation cancelled', bg: 'Резервацията е отменена' },
  
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
