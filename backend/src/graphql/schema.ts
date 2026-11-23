export const typeDefs = `
  type Student {
    id: ID!
    email: String!
    firstName: String!
    lastName: String!
    walletAddress: String
    did: String
    createdAt: String!
    enrollments: [Enrollment!]!
    certificates: [Certificate!]!
    learningProgress: [LearningProgress!]!
  }

  type Course {
    id: ID!
    title: String!
    description: String
    instructor: String!
    credits: Int!
    createdAt: String!
    modules: [CourseModule!]!
    enrollments: [Enrollment!]!
  }

  type CourseModule {
    id: ID!
    title: String!
    description: String
    lessons: [Lesson!]!
  }

  type Lesson {
    id: ID!
    title: String!
    content: String
    difficulty: String
    completed: Boolean
  }

  type Enrollment {
    id: ID!
    student: Student!
    course: Course!
    enrolledAt: String!
    status: String!
  }

  type Certificate {
    id: ID!
    student: Student!
    course: Course!
    tokenId: String!
    issuedAt: String!
    status: String!
    transactionHash: String
    network: String
  }

  type LearningProgress {
    id: ID!
    student: Student!
    course: Course!
    completedLessons: [String!]!
    percentage: Int!
    status: String!
  }

  input CreateStudentInput {
    email: String!
    firstName: String!
    lastName: String!
    walletAddress: String
    password: String!
  }

  input EnrollmentInput {
    studentId: ID!
    courseId: ID!
  }

  input ProgressUpdateInput {
    studentId: ID!
    courseId: ID!
    lessonId: String!
    status: String!
  }

  type Query {
    students: [Student!]!
    student(id: ID!): Student
    courses: [Course!]!
    course(id: ID!): Course
    enrollments: [Enrollment!]!
    certificates: [Certificate!]!
    learningProgress(studentId: ID!, courseId: ID!): LearningProgress
    health: String
  }

  type Mutation {
    createStudent(input: CreateStudentInput!): Student!
    enrollStudent(input: EnrollmentInput!): Enrollment!
    updateLearningProgress(input: ProgressUpdateInput!): LearningProgress!
    issueCertificate(studentId: ID!, courseId: ID!): Certificate!
    "Broadcasts an announcement to every newGlobalAnnouncement subscriber. Admin only."
    publishGlobalAnnouncement(input: GlobalAnnouncementInput!): GlobalAnnouncement!
  }

  type HealthResponse {
    status: String!
    message: String!
    uptime: Float!
    redis: String!
  }

  enum ExerciseStatus {
    QUEUED
    RUNNING
    PASSED
    FAILED
    ERROR
  }

  type ExerciseTestResult {
    name: String!
    status: String!
    gasUsed: Int!
    durationMs: Float!
    error: String
  }

  type ExerciseStatusEvent {
    studentId: ID!
    exerciseId: ID!
    jobId: ID
    status: ExerciseStatus!
    gasUsed: Int
    gasLimit: Int
    terminationReason: String
    passed: Int
    total: Int
    tests: [ExerciseTestResult!]
    message: String
    emittedAt: String!
  }

  type CourseProgressEvent {
    courseId: ID!
    studentId: ID!
    percentage: Int!
    status: String!
    completedLessons: [String!]!
    emittedAt: String!
  }

  enum AnnouncementSeverity {
    INFO
    WARNING
    CRITICAL
  }

  type GlobalAnnouncement {
    id: ID!
    title: String!
    message: String!
    severity: AnnouncementSeverity!
    publishedBy: ID
    emittedAt: String!
  }

  input GlobalAnnouncementInput {
    title: String!
    message: String!
    severity: AnnouncementSeverity
  }

  type Subscription {
    courseUpdated(courseId: ID!): Course!
    "Sandbox evaluation lifecycle for one student. Students may only subscribe to their own id."
    exerciseStatusUpdated(studentId: ID!): ExerciseStatusEvent!
    "Progress changes within a course. Non-admin subscribers only receive their own events."
    courseProgressChanged(courseId: ID!): CourseProgressEvent!
    newGlobalAnnouncement: GlobalAnnouncement!
  }
`;
