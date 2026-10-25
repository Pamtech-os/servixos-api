import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { EmployeesRepository } from 'src/modules/employees/repositories/employees.repository';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { TasksRepository } from 'src/modules/tasks/repositories/tasks.repository';
import { TasksService } from 'src/modules/tasks/services/tasks.service';
import { TaskPriority, TaskStage } from 'src/modules/tasks/schemas/task.schema';
import { UsersRepository } from 'src/modules/users/repositories/users.repository';
import { StorageService } from 'src/modules/storage/storage.service';
import { asMock } from 'test/helpers/mock';

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
    appendAttachment: jest.fn(),
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
      asMock<TasksRepository>(tasksRepository),
      asMock<EmployeesRepository>(employeesRepository),
      asMock<UsersRepository>(usersRepository),
      asMock<BusinessRepository>(businessRepository),
      asMock<RedisService>(redisService),
      asMock<AgendaService>(agendaService),
      {} as StorageService,
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

  describe('updateTask email notifications', () => {
    const ASSIGNEE_USER_ID = new Types.ObjectId().toString();
    const CREATOR_USER_ID = new Types.ObjectId().toString();

    const baseUser = (id: string) => ({
      _id: new Types.ObjectId(id),
      businessId: new Types.ObjectId(BUSINESS_ID),
      firstName: 'Task',
      lastName: 'Owner',
      email: 'owner@test.local',
      deletedAt: null,
    });

    const existingTask = {
      _id: new Types.ObjectId(TASK_ID),
      title: 'Fix the pipe',
      stage: TaskStage.TODO,
      priority: 'low',
      assigneeId: new Types.ObjectId(EMPLOYEE_ID),
      createdById: new Types.ObjectId(CREATOR_USER_ID),
      subtasks: [],
    };

    const assigneeEmployee = {
      _id: new Types.ObjectId(EMPLOYEE_ID),
      userId: new Types.ObjectId(ASSIGNEE_USER_ID),
      fullName: 'Jane Worker',
      email: 'jane@test.local',
    };

    beforeEach(() => {
      businessRepository.findById.mockResolvedValue({ timezone: 'UTC' });
      tasksRepository.createActivity.mockResolvedValue({});
      redisService.delByPattern.mockResolvedValue(0);
    });

    it('sends EMAIL_TASK_UPDATED_ASSIGNEE with changes when actor is not the assignee', async () => {
      // Arrange
      const actorUser = baseUser(USER_ID);
      usersRepository.findById.mockResolvedValue(actorUser);
      employeesRepository.findByUserId.mockResolvedValue(null);
      tasksRepository.findById.mockResolvedValue(existingTask);
      tasksRepository.updateById.mockResolvedValue({
        ...existingTask,
        priority: 'high',
        stage: TaskStage.IN_PROGRESS,
      });
      employeesRepository.findById.mockResolvedValue(assigneeEmployee);
      tasksRepository.findStageByKey.mockResolvedValue({
        key: TaskStage.IN_PROGRESS,
      });

      // Act
      await service.updateTask(TASK_ID, BUSINESS_ID, USER_ID, {
        priority: TaskPriority.HIGH,
        stage: TaskStage.IN_PROGRESS,
      });

      // Assert
      const jobPayload = agendaService.now.mock.calls[0] as [
        string,
        { changes: string[] },
      ];
      expect(jobPayload[0]).toBe('email:task:updated:assignee');
      expect(jobPayload[1]).toMatchObject({
        to: 'jane@test.local',
        assigneeName: 'Jane Worker',
        actorName: 'Task Owner',
      });
      expect(jobPayload[1].changes).toEqual(
        expect.arrayContaining([
          'Priority set to High',
          'Stage moved to In Progress',
        ]),
      );
    });

    it('sends EMAIL_TASK_UPDATED_ACTOR with changes when the assignee updates their own task', async () => {
      // Arrange
      const assigneeUser = {
        ...baseUser(ASSIGNEE_USER_ID),
        email: 'jane@test.local',
        firstName: 'Jane',
        lastName: 'Worker',
      };
      const creatorUser = {
        ...baseUser(CREATOR_USER_ID),
        email: 'creator@test.local',
        firstName: 'Bob',
        lastName: 'Creator',
      };
      usersRepository.findById
        .mockResolvedValueOnce(assigneeUser) // resolveActor
        .mockResolvedValueOnce(creatorUser); // creator lookup
      employeesRepository.findByUserId.mockResolvedValue(assigneeEmployee);
      tasksRepository.findById.mockResolvedValue(existingTask);
      tasksRepository.updateById.mockResolvedValue({
        ...existingTask,
        title: 'Fix the pipe (urgent)',
      });
      employeesRepository.findById.mockResolvedValue(assigneeEmployee);
      tasksRepository.findStageByKey.mockResolvedValue({ key: TaskStage.TODO });

      // Act
      await service.updateTask(TASK_ID, BUSINESS_ID, ASSIGNEE_USER_ID, {
        title: 'Fix the pipe (urgent)',
      });

      // Assert
      expect(agendaService.now).toHaveBeenCalledWith(
        'email:task:updated:actor',
        expect.objectContaining({
          to: 'creator@test.local',
          actorName: 'Bob Creator',
          assigneeName: 'Jane Worker',
          changes: ['Title changed to "Fix the pipe (urgent)"'],
        }),
      );
    });
  });

  describe('addSubtask email notifications', () => {
    it('sends EMAIL_TASK_UPDATED_ASSIGNEE with subtask change description', async () => {
      // Arrange
      const existingTask = {
        _id: new Types.ObjectId(TASK_ID),
        title: 'Fix the pipe',
        assigneeId: new Types.ObjectId(EMPLOYEE_ID),
        createdById: new Types.ObjectId(),
        subtasks: [],
      };
      const assigneeEmployee = {
        _id: new Types.ObjectId(EMPLOYEE_ID),
        userId: new Types.ObjectId(),
        fullName: 'Jane Worker',
        email: 'jane@test.local',
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
      tasksRepository.findById.mockResolvedValue(existingTask);
      tasksRepository.appendSubtask.mockResolvedValue({
        ...existingTask,
        subtasks: [
          {
            _id: new Types.ObjectId(),
            title: 'Check the valve',
            completed: false,
          },
        ],
      });
      tasksRepository.createActivity.mockResolvedValue({});
      employeesRepository.findById.mockResolvedValue(assigneeEmployee);
      redisService.delByPattern.mockResolvedValue(0);

      // Act
      await service.addSubtask(TASK_ID, BUSINESS_ID, USER_ID, {
        title: 'Check the valve',
      });

      // Assert
      expect(agendaService.now).toHaveBeenCalledWith(
        'email:task:updated:assignee',
        expect.objectContaining({
          to: 'jane@test.local',
          changes: ['Added subtask "Check the valve"'],
        }),
      );
    });
  });

  describe('updateSubtask email notifications', () => {
    it('sends EMAIL_TASK_UPDATED_ASSIGNEE with subtask completion change', async () => {
      // Arrange
      const subtaskId = new Types.ObjectId().toString();
      const existingTask = {
        _id: new Types.ObjectId(TASK_ID),
        title: 'Fix the pipe',
        assigneeId: new Types.ObjectId(EMPLOYEE_ID),
        createdById: new Types.ObjectId(),
        subtasks: [
          {
            _id: new Types.ObjectId(subtaskId),
            title: 'Check the valve',
            completed: false,
          },
        ],
      };
      const assigneeEmployee = {
        _id: new Types.ObjectId(EMPLOYEE_ID),
        userId: new Types.ObjectId(),
        fullName: 'Jane Worker',
        email: 'jane@test.local',
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
      tasksRepository.findById.mockResolvedValue(existingTask);
      tasksRepository.updateSubtaskCompletion.mockResolvedValue({
        ...existingTask,
        subtasks: [
          {
            _id: new Types.ObjectId(subtaskId),
            title: 'Check the valve',
            completed: true,
          },
        ],
      });
      tasksRepository.createActivity.mockResolvedValue({});
      employeesRepository.findById.mockResolvedValue(assigneeEmployee);
      redisService.delByPattern.mockResolvedValue(0);

      // Act
      await service.updateSubtask(TASK_ID, subtaskId, BUSINESS_ID, USER_ID, {
        completed: true,
      });

      // Assert
      expect(agendaService.now).toHaveBeenCalledWith(
        'email:task:updated:assignee',
        expect.objectContaining({
          to: 'jane@test.local',
          changes: ['"Check the valve" marked as completed'],
        }),
      );
    });
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
        service as unknown as { checkAndNotifyOverdueTasks(): Promise<void> }
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
        service as unknown as { checkAndNotifyOverdueTasks(): Promise<void> }
      ).checkAndNotifyOverdueTasks();

      // Assert
      expect(agendaService.now).not.toHaveBeenCalled();
      expect(redisService.set).not.toHaveBeenCalled();
    });
  });

  // ─── addTaskAttachment ───────────────────────────────────────────────────────

  describe('addTaskAttachment', () => {
    const actor = {
      _id: new Types.ObjectId(USER_ID),
      businessId: new Types.ObjectId(BUSINESS_ID),
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@test.local',
      deletedAt: null,
    };

    const input = {
      url: 'https://cdn.example.com/file.pdf',
      publicId: 'servixos/task-attachments/biz/task/file',
      filename: 'report.pdf',
      mimeType: 'application/pdf',
      filesizeBytes: 4096,
    };

    beforeEach(() => {
      usersRepository.findById.mockResolvedValue(actor);
      employeesRepository.findByUserId.mockResolvedValue(null);
      businessRepository.findById.mockResolvedValue({ timezone: 'UTC' });
    });

    it('returns NotFoundException when the task does not exist', async () => {
      // Arrange
      tasksRepository.findById.mockResolvedValue(null);

      // Act
      const result = await service.addTaskAttachment(
        TASK_ID,
        BUSINESS_ID,
        USER_ID,
        input,
      );

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('returns NotFoundException when the actor is not in the business', async () => {
      // Arrange
      tasksRepository.findById.mockResolvedValue({
        _id: new Types.ObjectId(TASK_ID),
        title: 'Fix sink',
      });
      usersRepository.findById.mockResolvedValue({
        ...actor,
        businessId: new Types.ObjectId(), // different business
      });

      // Act
      const result = await service.addTaskAttachment(
        TASK_ID,
        BUSINESS_ID,
        USER_ID,
        input,
      );

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });

    it('appends attachment metadata and logs activity on success', async () => {
      // Arrange
      const existingTask = {
        _id: new Types.ObjectId(TASK_ID),
        title: 'Fix sink',
        attachments: [],
      };
      const updatedTask = {
        ...existingTask,
        attachments: [{ ...input, _id: new Types.ObjectId() }],
      };
      tasksRepository.findById.mockResolvedValue(existingTask);
      tasksRepository.appendAttachment.mockResolvedValue(updatedTask);
      tasksRepository.createActivity.mockResolvedValue({});
      redisService.delByPattern.mockResolvedValue(0);

      // Act
      const result = await service.addTaskAttachment(
        TASK_ID,
        BUSINESS_ID,
        USER_ID,
        input,
      );

      // Assert
      expect(tasksRepository.appendAttachment).toHaveBeenCalledWith(
        TASK_ID,
        expect.any(Types.ObjectId),
        expect.objectContaining({
          url: input.url,
          publicId: input.publicId,
          filename: input.filename,
          mimeType: input.mimeType,
          filesizeBytes: input.filesizeBytes,
        }),
      );
      expect(tasksRepository.createActivity).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'attachment_added' }),
      );
      expect(result).toEqual(updatedTask);
    });

    it('returns NotFoundException when appendAttachment returns null', async () => {
      // Arrange
      tasksRepository.findById.mockResolvedValue({
        _id: new Types.ObjectId(TASK_ID),
        title: 'Fix sink',
      });
      tasksRepository.appendAttachment.mockResolvedValue(null);

      // Act
      const result = await service.addTaskAttachment(
        TASK_ID,
        BUSINESS_ID,
        USER_ID,
        input,
      );

      // Assert
      expect(result).toBeInstanceOf(NotFoundException);
    });
  });
});
