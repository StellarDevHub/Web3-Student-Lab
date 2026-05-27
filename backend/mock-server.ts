import express from 'express';
import cors from 'cors';

const app = express();
const port = 8080;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Mock backend is running',
    version: '1.0.0',
  });
});

// Mock API endpoints
app.get('/api/v1/courses', (req, res) => {
  res.json({
    status: 'success',
    data: [
      {
        id: '1',
        title: 'Blockchain Fundamentals',
        description: 'Learn the basics of blockchain technology',
        instructor: 'Dr. Smith',
        credits: 3,
      },
      {
        id: '2',
        title: 'Smart Contract Development',
        description: 'Build smart contracts with Soroban',
        instructor: 'Dr. Johnson',
        credits: 4,
      },
    ],
  });
});

app.get('/api/v1/students', (req, res) => {
  res.json({
    status: 'success',
    data: [
      { id: '1', email: 'student1@example.com', firstName: 'John', lastName: 'Doe' },
      { id: '2', email: 'student2@example.com', firstName: 'Jane', lastName: 'Smith' },
    ],
  });
});

app.post('/api/v1/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (email && password) {
    res.json({
      status: 'success',
      data: {
        token: 'mock-jwt-token',
        user: { id: '1', email, firstName: 'John', lastName: 'Doe' },
      },
    });
  } else {
    res.status(400).json({
      status: 'error',
      message: 'Email and password are required',
    });
  }
});

console.log(`Mock backend running on http://localhost:${port}`);
app.listen(port, () => {
  console.log(`Mock backend running on http://localhost:${port}`);
});
