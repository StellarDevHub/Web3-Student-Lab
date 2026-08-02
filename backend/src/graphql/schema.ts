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
  }

  type HealthResponse {
    status: String!
    message: String!
    uptime: Float!
    redis: String!
  }

  type Subscription {
    courseUpdated(courseId: ID!): Course!
  }
`;
