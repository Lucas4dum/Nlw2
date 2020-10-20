import { Request, Response } from 'express';

import db from '../database/connection';
import convertHourToMinutes from '../utils/convertHourToMinutes';

interface ScheduleItem {
  week_day: number;
  from: string;
  to: string;
}

export default class ClassesController {
  async index(req:Request, res:Response) {
    const filters = req.query;

    const subject = filters.subject as string;
    const week_day = filters.week_day as string;
    const time = filters.time as string;
    console.log({
      subject,
      time,
      week_day,
    });
    if (!filters.week_day || !filters.subject || !filters.time) {
      return res.status(400).json({
        error: 'Missing filters to search classes'
      });
    }

    const timeInMinuts = convertHourToMinutes(time);

    // Query - aplicando filtros
    const classes = await db('classes')
      .whereExists(function () {
        this.select('class_schedule.*')
          .from('class_schedule')
          .whereRaw('`class_schedule`.`class_id` = `classes`.`id`')
          .whereRaw('`class_schedule`.`week_day` = ??', [Number(week_day)])
          .whereRaw('`class_schedule`.`from` <= ??', [timeInMinuts])
          .whereRaw('`class_schedule`.`to` > ??', [timeInMinuts])
      })
      .where('classes.subject', '=', subject)
      .join('users', 'classes.user_id', '=', 'users.id')
      .select(['classes.*', 'users.*']);

    return res.json(classes);
  }

  async create(req:Request, res:Response) {
    // Desestruturação
    const { 
      name,
      avatar,
      whatsapp,
      bio,
      subject,
      cost,
      schedule
    } = req.body;
  
    // Transaction
    const trx = await db.transaction();
  
    try {
      // Insert users
      const insertedUsersIds = await trx('users').insert({
        name,
        avatar,
        whatsapp,
        bio
      });
  
      const user_id = insertedUsersIds[0];
  
      // Insert classes
      const insertedClassesIds = await trx('classes').insert({
        subject,
        cost,
        user_id
      });
  
      const class_id = insertedClassesIds[0];
  
      // Insert class_schedule
      const classSchedule = schedule.map((scheduleItem: ScheduleItem) => {
        return {
          class_id,
          week_day: scheduleItem.week_day,
          from: convertHourToMinutes(scheduleItem.from),
          to: convertHourToMinutes(scheduleItem.to)
        };
      })
  
      await trx('class_schedule').insert(classSchedule);
  
      // Transaction Commit
      await trx.commit();
  
      // Return success
      return res.status(201).send();
  
    } catch (err) {
      // DB rollback
      await trx.rollback();
  
      // Return error
      return res.status(400).json({
        error: 'Unexpected error while creating new class'
      });
    }
  }
}