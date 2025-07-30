const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect("mongodb+srv://medicalaibyme:IX257q4gLm2JBKRG@cluster0.b5q97yw.mongodb.net/taskManager", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 30000,
  connectTimeoutMS: 30000,
  socketTimeoutMS: 45000
})
.then(() => console.log('Connected to MongoDB'))
.catch((err) => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Root endpoint
app.get('/', (req, res) => {
  const connectionStatus = mongoose.connection.readyState;
  const statusMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  res.status(200).json({
    message: 'API is running',
    mongoDBStatus: statusMap[connectionStatus] || 'unknown'
  });
});

// Employee Schema
const employeeSchema = new mongoose.Schema({
  employeeId: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  role: { type: String, required: true, trim: true },
  password: { type: String, required: true }
});

employeeSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

const Employee = mongoose.model('Employee', employeeSchema);

// Task Schema
const taskSchema = new mongoose.Schema({
  customerName: { type: String, required: true, trim: true },
  customerContact: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  currentStep: { type: String, required: true, trim: true },
  assignedTo: {  type: String, required: true, trim: true },
  dueDate: { type: Date, required: true },
  completedSteps: [{
    stepName: { type: String, required: true },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    details: { type: String },
    completedAt: { type: Date, default: Date.now }
  }],
  status: { type: String, enum: ['pending', 'in-progress', 'completed'], default: 'pending' }
}, { timestamps: true });

const Task = mongoose.model('Task', taskSchema);

// Payment Schema
const paymentSchema = new mongoose.Schema({
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  customerName: { type: String, required: true, trim: true },
  amountDue: { type: Number, required: true },
  dueDate: { type: Date, required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  status: { type: String, enum: ['Pending', 'Collected', 'Overdue'], default: 'Pending' },
  collectedAmount: { type: Number },
  collectedOn: { type: Date }
}, { timestamps: true });

const Payment = mongoose.model('Payment', paymentSchema);

// Authentication Routes
app.post('/api/auth/employee-login', async (req, res) => {
  try {
    const { employeeId, password } = req.body;
    const employee = await Employee.findOne({ employeeId });
    
    if (!employee) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, employee.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({
      message: 'Login successful',
      employee: {
        id: employee._id,
        employeeId: employee.employeeId,
        name: employee.name,
        role: employee.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  // Since we're not using tokens, just return success
  res.json({ message: 'Logout successful' });
});

// Employee Routes (Admin only)
app.post('/api/employees', async (req, res) => {
  try {
    const employee = new Employee(req.body);
    await employee.save();
    const { password, ...employeeData } = employee.toObject();
    res.status(201).json(employeeData);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/employees', async (req, res) => {
  try {
    const employees = await Employee.find().select('-password');
    res.json(employees);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/employees/:id', async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id).select('-password');
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    res.json(employee);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/employees/:id', async (req, res) => {
  try {
    const employee = await Employee.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    }).select('-password');
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    res.json(employee);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/employees/:id', async (req, res) => {
  try {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Task Routes
app.post('/api/tasks', async (req, res) => {
  try {
    const task = new Task(req.body);
    await task.save();
    const populatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name employeeId')
      .populate('completedSteps.completedBy', 'name employeeId');
    res.status(201).json(populatedTask);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await Task.find()
      .populate('assignedTo', 'name employeeId')
      .populate('completedSteps.completedBy', 'name employeeId');
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/tasks/:id', async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignedTo', 'name employeeId')
      .populate('completedSteps.completedBy', 'name employeeId');
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/tasks/:id', async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    }).populate('assignedTo', 'name employeeId')
      .populate('completedSteps.completedBy', 'name employeeId');
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tasks/:id/complete-step', async (req, res) => {
  try {
    const { stepName, stepCompletedBy, details, completedAt } = req.body;
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    task.completedSteps.push({
      stepName,
      completedBy: stepCompletedBy,
      details,
      completedAt: completedAt || Date.now()
    });

    if (req.body.status) {
      task.status = req.body.status;
    }

    await task.save();
    const populatedTask = await Task.findById(task._id)
      .populate('assignedTo', 'name employeeId')
      .populate('completedSteps.completedBy', 'name employeeId');
    res.json(populatedTask);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Payment Routes
app.post('/api/payments', async (req, res) => {
  try {
    const payment = new Payment(req.body);
    await payment.save();
    const populatedPayment = await Payment.findById(payment._id)
      .populate('assignedTo', 'name employeeId')
      .populate('taskId', 'customerName');
    res.status(201).json(populatedPayment);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/payments', async (req, res) => {
  try {
    const payments = await Payment.find()
      .populate('assignedTo', 'name employeeId')
      .populate('taskId', 'customerName');
    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/payments/:id', async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('assignedTo', 'name employeeId')
      .populate('taskId', 'customerName');
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json(payment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/payments/:id', async (req, res) => {
  try {
    const payment = await Payment.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    }).populate('assignedTo', 'name employeeId')
      .populate('taskId', 'customerName');
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json(payment);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/payments/:id', async (req, res) => {
  try {
    const payment = await Payment.findByIdAndDelete(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Report Routes
app.get('/api/reports/tasks', async (req, res) => {
  try {
    const { status, from, to } = req.query;
    let query = {};

    if (status) query.status = status;
    if (from || to) {
      query.dueDate = {};
      if (from) query.dueDate.$gte = new Date(from);
      if (to) query.dueDate.$lte = new Date(to);
    }

    const tasks = await Task.find(query)
      .populate('assignedTo', 'name employeeId')
      .populate('completedSteps.completedBy', 'name employeeId');
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/payments', async (req, res) => {
  try {
    const { status, from, to } = req.query;
    let query = {};

    if (status) query.status = status;
    if (from || to) {
      query.dueDate = {};
      if (from) query.dueDate.$gte = new Date(from);
      if (to) query.dueDate.$lte = new Date(to);
    }

    const payments = await Payment.find(query)
      .populate('assignedTo', 'name employeeId')
      .populate('taskId', 'customerName');
    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/reports/employees', async (req, res) => {
  try {
    const employees = await Employee.find().select('-password');
    const report = await Promise.all(employees.map(async (employee) => {
      const tasks = await Task.countDocuments({ assignedTo: employee._id });
      const payments = await Payment.countDocuments({ assignedTo: employee._id });
      return {
        ...employee.toObject(),
        taskCount: tasks,
        paymentCount: payments
      };
    }));
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
