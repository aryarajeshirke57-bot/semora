import type { Course, Student } from '../types.ts';

export const STUDENT: Student = {
  name: 'Alex Chen',
  email: 'alex.chen@andrew.cmu.edu',
  year: 'Sophomore',
  school: 'School of Computer Science',
  section: 'B',
  timezone: 'America/New_York',
};

export const CANVAS_IDS: Record<string, number> = { '15-122': 48211, '21-241': 48377, '15-151': 48206, '76-101': 49012 };
export const PIAZZA_NETWORKS: Record<string, string> = { '15-122': 'lx2f15122f26', '15-151': 'lx2f15151f26' };
export const GRADESCOPE_IDS: Record<string, number> = { '15-122': 812201, '21-241': 812417, '15-151': 812150, '76-101': 812933 };

export const COURSES: Course[] = [
  {
    code: '15-122',
    title: 'Principles of Imperative Computation',
    instructor: 'Prof. Dana Whitfield',
    staff: [
      { name: 'Prof. Dana Whitfield', role: 'instructor', email: 'dwhitfield@cs.cmu.edu' },
      { name: 'Priya Raman', role: 'ta', email: 'praman@andrew.cmu.edu' },
      { name: '15-122 Course Staff', role: 'staff', email: '15122-staff@cs.cmu.edu' },
    ],
    section: 'B',
    color: '262',
    weights: [
      { category: 'Written homework', weight: 0.15 },
      { category: 'Programming', weight: 0.35 },
      { category: 'Midterms', weight: 0.2 },
      { category: 'Final', weight: 0.3 },
    ],
    links: [
      { label: 'Canvas', url: 'https://canvas.cmu.edu/courses/48211' },
      { label: 'Piazza', url: 'https://piazza.com/class/lx2f15122f26' },
      { label: 'Autolab', url: 'https://autolab.andrew.cmu.edu/courses/15122-f26' },
      { label: 'Course site', url: 'https://www.cs.cmu.edu/~15122' },
    ],
    officeHours: ['Prof. Whitfield · Tue 2–3 PM · GHC 7015', 'TA hours · daily 6–9 PM · GHC 5th floor clusters'],
  },
  {
    code: '21-241',
    title: 'Matrices and Linear Transformations',
    instructor: 'Prof. Marcus Lee',
    staff: [
      { name: 'Prof. Marcus Lee', role: 'instructor', email: 'mlee@andrew.cmu.edu' },
      { name: 'Sam Ortiz', role: 'ta', email: 'sortiz@andrew.cmu.edu' },
    ],
    color: '200',
    weights: [
      { category: 'Quizzes', weight: 0.1 },
      { category: 'Homework', weight: 0.2 },
      { category: 'Midterms', weight: 0.4 },
      { category: 'Final', weight: 0.3 },
    ],
    links: [
      { label: 'Canvas', url: 'https://canvas.cmu.edu/courses/48377' },
      { label: 'Gradescope', url: 'https://www.gradescope.com/courses/812417' },
    ],
    officeHours: ['Prof. Lee · Mon 1–2 PM · Wean 6113', 'Sam Ortiz · Thu 4–5 PM · Wean 8220'],
  },
  {
    code: '15-151',
    title: 'Mathematical Foundations for Computer Science',
    instructor: 'Prof. Elena Sorokin',
    staff: [
      { name: 'Prof. Elena Sorokin', role: 'instructor', email: 'esorokin@cs.cmu.edu' },
      { name: 'Noah Feld', role: 'ta', email: 'nfeld@andrew.cmu.edu' },
    ],
    color: '150',
    weights: [
      { category: 'Problem sets', weight: 0.4 },
      { category: 'Midterms', weight: 0.3 },
      { category: 'Final', weight: 0.3 },
    ],
    links: [
      { label: 'Canvas', url: 'https://canvas.cmu.edu/courses/48206' },
      { label: 'Piazza', url: 'https://piazza.com/class/lx2f15151f26' },
      { label: 'Gradescope', url: 'https://www.gradescope.com/courses/812150' },
    ],
    officeHours: ['Prof. Sorokin · Wed 3–5 PM · GHC 6115', 'Noah Feld · Mon 7–9 PM · GHC 4102'],
  },
  {
    code: '76-101',
    title: 'Interpretation and Argument',
    instructor: 'Prof. James Okafor',
    staff: [
      { name: 'Prof. James Okafor', role: 'instructor', email: 'jokafor@andrew.cmu.edu' },
      { name: 'Maya Lindqvist', role: 'ta', email: 'mlindqvist@andrew.cmu.edu' },
    ],
    color: '30',
    weights: [
      { category: 'Essays', weight: 0.5 },
      { category: 'Presentation', weight: 0.2 },
      { category: 'Participation', weight: 0.1 },
      { category: 'Final', weight: 0.2 },
    ],
    links: [{ label: 'Canvas', url: 'https://canvas.cmu.edu/courses/49012' }],
    officeHours: ['Prof. Okafor · Thu 11 AM–12 PM · Baker Hall 245', 'Maya Lindqvist · Tue 3–4 PM · Hunt Library 3rd floor'],
  },
];

/** Who's who, for authority ranking of incoming mail and posts. */
export const PEOPLE: Record<string, { name: string; role: 'instructor' | 'ta' | 'staff' | 'student' | 'self'; course?: string; section?: string }> = {
  'dwhitfield@cs.cmu.edu': { name: 'Prof. Dana Whitfield', role: 'instructor', course: '15-122' },
  'praman@andrew.cmu.edu': { name: 'Priya Raman', role: 'ta', course: '15-122' },
  '15122-staff@cs.cmu.edu': { name: '15-122 Course Staff', role: 'staff', course: '15-122' },
  'mlee@andrew.cmu.edu': { name: 'Prof. Marcus Lee', role: 'instructor', course: '21-241' },
  'sortiz@andrew.cmu.edu': { name: 'Sam Ortiz', role: 'ta', course: '21-241' },
  'esorokin@cs.cmu.edu': { name: 'Prof. Elena Sorokin', role: 'instructor', course: '15-151' },
  'nfeld@andrew.cmu.edu': { name: 'Noah Feld', role: 'ta', course: '15-151' },
  'jokafor@andrew.cmu.edu': { name: 'Prof. James Okafor', role: 'instructor', course: '76-101' },
  'mlindqvist@andrew.cmu.edu': { name: 'Maya Lindqvist', role: 'ta', course: '76-101' },
  'jordank@andrew.cmu.edu': { name: 'Jordan Kim', role: 'student', course: '15-122', section: 'B' },
  'rpatel@andrew.cmu.edu': { name: 'Riley Patel', role: 'student', course: '15-122', section: 'C' },
  'smarquez@andrew.cmu.edu': { name: 'Sofia Marquez', role: 'student', course: '76-101' },
  'ebrooks@andrew.cmu.edu': { name: 'Ethan Brooks', role: 'student', course: '76-101' },
  'alex.chen@andrew.cmu.edu': { name: 'Alex Chen', role: 'self' },
};
