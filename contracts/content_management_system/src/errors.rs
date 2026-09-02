use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    NotInstructor = 4,
    AlreadyInstructor = 5,
    ContentNotFound = 6,
    VersionNotFound = 7,
    TitleTooLong = 8,
    DescriptionTooLong = 9,
    InvalidContentHash = 10,
    InvalidStatusTransition = 11,
    ContentArchived = 12,
    AlreadyArchived = 13,
    AccessDenied = 14,
    EnrollmentNotAllowed = 15,
    AlreadyEnrolled = 16,
    NotEnrolled = 17,
}
