import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { EmployeesRepository } from 'src/modules/employees/repositories/employees.repository';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { TasksRepository } from 'src/modules/tasks/repositories/tasks.repository';
import { TasksService } from 'src/modules/tasks/services/tasks.service';
import { TaskStage } from 'src/modules/tasks/schemas/task.schema';
import { UsersRepository } from 'src/modules/users/repositories/users.repository';

const BUSINESS_ID = new Types.ObjectId().toString();
const EMPLOYEE_ID = new Types.ObjectId().toString();
const TASK_ID = new Types.ObjectId().toString();
const USER_ID = new Types.ObjectId().toString();

describe('TasksService', () => {
  let service: TasksService;

  const tasksRepository = {
    findAll: jest.fn(),
    findById: jest.fn(),
    findOverdueForBusiness: jest.fn(),
    create: jest.fn(),
    updateById: jest.fn(),
    softDelete: jest.fn(),
    appendComment: jest.fn(),
    appendSubtask: jest.fn(),
    updateSubtaskCompletion: jest.fn(),
    findStageByKey: jest.fn(),
    upsertDefaultStages: jest.fn(),
    createActivity: jest.fn(),
    findActivitiesByTask: jest.fn(),
  };

  const employeesRepository = {
    findById: jest.fn(),
    findByUserId: jest.fn(),
  };

  const businessRepository = {
    findById: jest.fn(),
    findAllTimezones: jest.fn(),
  };

  const usersRepository = {
    findById: jest.fn(),
  };

  const redisService = {
    get: jest.fn(),
    set: jest.fn(),
    delByPattern: jest.fn(),
  };

  const agendaService = {
    define: jest.fn(),
    now: jest.fn().mockResolvedValue(undefined),
    every: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TasksService(
      tasksRepository as unknown as TasksRepository,
      employeesRepository as unknown as EmployeesRepository,
      usersRepository as unknown as UsersRepository,
      businessRepository as unknown as BusinessRepository,
      redisService as unknown as RedisService,
      agendaService as unknown as AgendaService,
    );
  });

  it('returns not found when creating task with unknown assignee', async () => {
    // Arrange
    employeesRepository.findById.mockResolvedValue(null);
    employeesRepository.findByUserId.mockResolvedValue(null);
    usersRepository.findById.mockResolvedValue({
      _id: new Types.ObjectId(USER_ID),
      businessId: new Types.ObjectId(BUSINESS_ID),
      firstName: 'Task',
      lastName: 'Owner',
      deletedAt: null,
    });
    businessRepository.findById.mockResolvedValue({ timezone: 'UTC' });

    // Act
    const result = await service.createTask(BUSINESS_ID, USER_ID, {
      title: 'Fix bathroom leak',
      description: 'Address leak under the sink',
      assigneeId: EMPLOYEE_ID,
      priority: undefined,
      dueDate: '2026-04-20',
      stage: TaskStage.TODO,
    });

    // Assert
    expect(result).toBeInstanceOf(NotFoundException);
  });

  it('creates a task without an assignee', async () => {
    // Arrange
    const createdTask = {
      _id: new Types.ObjectId(TASK_ID),
      title: 'Unassigned task',
      stage: TaskStage.TODO,
    };
    usersRepository.findById.mockResolvedValue({
      _id: new Types.ObjectId(USER_ID),
      businessId: new Types.ObjectId(BUSINESS_ID),
      firstName: 'Task',
      lastName: 'Owner',
      email: 'owner@test.local',
      deletedAt: null,
    });
    employeesRepository.findByUserId.mockResolvedValue(null);
    businessRepository.findById.mockResolvedValue({ timezone: 'UTC' });
    tasksRepository.findStageByKey.mockResolvedValue({ key: TaskStage.TODO });
    tasksRepository.create.mockResolvedValue(createdTask);
    tasksRepository.createActivity.mockResolvedValue({});
    redisService.delByPattern.mockResolvedValue(0);

    // Act
    const result = await service.createTask(BUSINESS_ID, USER_ID, {
      title: 'Unassigned task',
      stage: TaskStage.TODO,
    });

    // Assert
    expect(result).toEqual(createdTask);
    expect(tasksRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Unassigned task',
        assigneeId: undefined,
      }),
    );
    expect(agendaService.now).not.toHaveBeenCalledWith(
      'email:task:assigned',
      expect.anything(),
    );
  });

  it('allows non-employee business user to comment on a task', async () => {
    usersRepository.findById.mockResolvedValue({
      _id: new Types.ObjectId(USER_ID),
      businessId: new Types.ObjectId(BUSINESS_ID),
      firstName: 'Business',
      lastName: 'Owner',
      deletedAt: null,
    });
    employeesRepository.findByUserId.mockResolvedValue(null);
    businessRepository.findById.mockResolvedValue({ timezone: 'UTC' });
    tasksRepository.findById.mockResolvedValue({
      _id: new Types.ObjectId(TASK_ID),
      title: 'Fix sink',
    });
    tasksRepository.appendComment.mockResolvedValue({
      _id: new Types.ObjectId(TASK_ID),
      title: 'Fix sink',
      comments: [
        {
          content: 'Parts ordered',
        },
      ],
    });
    tasksRepository.createActivity.mockResolvedValue({
      _id: new Types.ObjectId(),
      type: 'comment_added',
    });

    const result = await service.addComment(TASK_ID, BUSINESS_ID, USER_ID, {
      content: 'Parts ordered',
    });

    expect(result).not.toBeInstanceOf(NotFoundException);
    expect(tasksRepository.appendComment).toHaveBeenCalledTimes(1);
    const appendCommentCall = tasksRepository.appendComment.mock.calls[0] as [
      string,
      Types.ObjectId,
      { authorId: Types.ObjectId; authorName: string; content: string },
    ];
    expect(appendCommentCall[0]).toBe(TASK_ID);
    expect(appendCommentCall[1]).toBeInstanceOf(Types.ObjectId);
    expect(appendCommentCall[2]).toMatchObject({
      authorName: 'Business Owner',
      content: 'Parts ordered',
    });
    expect(appendCommentCall[2].authorId).toBeInstanceOf(Types.ObjectId);
  });

  it('bootstraps default task stages for a business', async () => {
    tasksRepository.upsertDefaultStages.mockResolvedValue(undefined);

    const result = await service.bootstrapDefaultStages(BUSINESS_ID);

    expect(result).toBeNull();
    expect(tasksRepository.upsertDefaultStages).toHaveBeenCalledWith(
      expect.any(Types.ObjectId),
      expect.arrayContaining([
        expect.objectContaining({ key: TaskStage.TODO }),
        expect.objectContaining({ key: TaskStage.IN_PROGRESS }),
        expect.objectContaining({ key: TaskStage.COMPLETED }),
      ]),
    );
  });

  it('returns subtask not found when updating missing subtask', async () => {
    usersRepository.findById.mockResolvedValue({
      _id: new Types.ObjectId(USER_ID),
      businessId: new Types.ObjectId(BUSINESS_ID),
      firstName: 'Task',
      lastName: 'Owner',
      deletedAt: null,
    });
    employeesRepository.findByUserId.mockResolvedValue(null);
    businessRepository.findById.mockResolvedValue({ timezone: 'UTC' });
    tasksRepository.findById.mockResolvedValue({
      _id: new Types.ObjectId(TASK_ID),
      subtasks: [{ _id: new Types.ObjectId(), title: 'x', completed: false }],
    });

    const result = await service.updateSubtask(
      TASK_ID,
      new Types.ObjectId().toString(),
      BUSINESS_ID,
      USER_ID,
      { completed: true },
    );

    expect(result).toBeInstanceOf(NotFoundException);
  });

  describe('overdue task notifications', () => {
    // Fix system time to 2026-05-01T00:00:00Z (midnight UTC).
    // UTC timezone → local hour = 0 → should process.
    // America/New_York (UTC-4 in May) → local hour = 20 → should skip.
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-05-01T00:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('sends overdue emails for businesses at local midnight and skips others', async () => {
      // Arrange
      const bizUtc = { _id: new Types.ObjectId(), timezone: 'UTC' };
      const bizNy = { _id: new Types.ObjectId(), timezone: 'America/New_York' };
      const overdueTask = {
        _id: new Types.ObjectId(TASK_ID),
        title: 'Fix the leak',
        dueDate: new Date('2026-04-30T00:00:00Z'),
        assigneeId: {
          _id: new Types.ObjectId(EMPLOYEE_ID),
          email: 'worker@test.local',
          fullName: 'Jane Worker',
        },
      };

      businessRepository.findAllTimezones.mockResolvedValue([bizUtc, bizNy]);
      tasksRepository.findOverdueForBusiness.mockResolvedValue([overdueTask]);
      redisService.get.mockResolvedValue(null);
      redisService.set.mockResolvedValue('OK');

      // Act
      await (
        service as unknown as {
          checkAndNotifyOverdueTasks(): Promise<void>;
        }
      ).checkAndNotifyOverdueTasks();

      // Assert — only UTC business reached the overdue query
      expect(tasksRepository.findOverdueForBusiness).toHaveBeenCalledTimes(1);
      expect(tasksRepository.findOverdueForBusiness).toHaveBeenCalledWith(
        bizUtc._id,
        expect.any(Date),
      );
      expect(agendaService.now).toHaveBeenCalledWith(
        'email:task:overdue',
        expect.objectContaining({
          to: 'worker@test.local',
          assigneeName: 'Jane Worker',
          taskTitle: 'Fix the leak',
        }),
      );
      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringContaining(TASK_ID),
        '1',
        25 * 60 * 60,
      );
    });

    it('skips overdue email if Redis dedup key already exists', async () => {
      // Arrange
      const biz = { _id: new Types.ObjectId(), timezone: 'UTC' };
      businessRepository.findAllTimezones.mockResolvedValue([biz]);
      tasksRepository.findOverdueForBusiness.mockResolvedValue([
        {
          _id: new Types.ObjectId(TASK_ID),
          title: 'Already notified task',
          dueDate: new Date('2026-04-30T00:00:00Z'),
          assigneeId: {
            _id: new Types.ObjectId(EMPLOYEE_ID),
            email: 'worker@test.local',
            fullName: 'Jane Worker',
          },
        },
      ]);
      redisService.get.mockResolvedValue('1'); // already sent today

      // Act
      await (
        service as unknown as {
          checkAndNotifyOverdueTasks(): Promise<void>;
        }
      ).checkAndNotifyOverdueTasks();

      // Assert
      expect(agendaService.now).not.toHaveBeenCalled();
      expect(redisService.set).not.toHaveBeenCalled();
    });
  });
});
